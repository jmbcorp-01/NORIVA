"use server";

import { applyFields } from "@/lib/artifact-fields";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { checkCredentials, endSession, requireOwner, startSession } from "@/lib/auth";
import {
  approveArtifact,
  editArtifact,
  rejectArtifact,
  startStage,
  StudioError,
} from "@/lib/studio";
import { ALL_STAGES, IMAGE_MODELS, restGate, type Stage } from "@/lib/pipeline";
import { publishEpisode, unpublishEpisode } from "@/lib/studio-publish";
import { enqueueJob, notifyWorker } from "@/lib/queue";
import { putPrivate } from "@/lib/private-media";
import { putPublic } from "@/lib/public-media";
import { replacePanel } from "@/lib/hand-edit";
import { setVerdict, type Verdict } from "@/lib/judge";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { totpSecret } from "@/lib/studio-2fa";
import { verifyTotp } from "@/lib/totp";
import type { GuidelineBody } from "@/db/schema";

const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

function back(path: string, error?: unknown): never {
  if (error) {
    const msg = error instanceof StudioError || error instanceof z.ZodError ? (error instanceof z.ZodError ? "입력값을 확인해 주세요" : error.message) : "처리하지 못했어요";
    if (!(error instanceof StudioError) && !(error instanceof z.ZodError)) console.error(error);
    redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);
  }
  redirect(path);
}

/* ─── 로그인 ─── */

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  // 같은 곳에서 15분에 10번까지만 시도할 수 있어요
  if (!(await rateLimit(`studio-login:${clientIp(await headers())}`, 10, 900))) redirect("/studio/login?error=limit");
  if (!(await checkCredentials(email, password))) {
    redirect("/studio/login?error=1");
  }
  const secret = await totpSecret();
  if (secret && !verifyTotp(secret, String(formData.get("code") ?? ""))) redirect("/studio/login?error=code");
  await startSession(email.trim().toLowerCase());
  redirect("/studio");
}

export async function logout() {
  await endSession();
  redirect("/studio/login");
}

/* ─── 소재 라이브러리 ─── */

const sourceSchema = z.object({
  name: z.string().min(1),
  category: z.enum(schema.sourceCategory.enumValues),
  era: z.string(),
  summary: z.string(),
  visualNotes: z.string(),
  caution: z.string(),
});

export async function saveSource(formData: FormData) {
  await requireOwner();
  const id = String(formData.get("id") ?? "");
  const path = id ? `/studio/sources/${id}` : "/studio/sources/new";
  let savedId = id;
  try {
    const base = sourceSchema.parse(Object.fromEntries(formData));
    const values = {
      ...base,
      rules: lines(formData.get("rules")),
      references: lines(formData.get("references")),
      overlapWorks: lines(formData.get("overlapWorks")),
      updatedAt: new Date(),
    };
    if (id) {
      await db.update(schema.sources).set(values).where(eq(schema.sources.id, id));
    } else {
      const [row] = await db.insert(schema.sources).values(values).returning({ id: schema.sources.id });
      savedId = row.id;
    }
    if (formData.get("ai") === "1") await queueSourceFill(savedId);
  } catch (e) {
    back(path, e);
  }
  revalidatePath("/studio/sources");
  redirect(`/studio/sources/${savedId}?${formData.get("ai") === "1" ? "filling=1" : "saved=1"}`);
}

/** 소재 이름을 보고 빈 칸을 AI가 조사해 채워요. 대표가 쓴 칸은 덮지 않아요. */
async function queueSourceFill(sourceId: string) {
  const busy = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.type, "source_fill"),
        inArray(schema.jobs.status, ["queued", "running"]),
        sql`${schema.jobs.payload}->>'source_id' = ${sourceId}`,
      ),
    );
  if (busy.length) return;
  await enqueueJob({ type: "source_fill", payload: { source_id: sourceId } });
}

/* ─── 지침 ─── */

export async function saveGuidelineVersion(formData: FormData) {
  const owner = await requireOwner();
  const id = String(formData.get("id"));
  const path = `/studio/guidelines/${id}`;
  try {
    const rules = lines(formData.get("rules")).map((l) => {
      const [code, ...rest] = l.split("|");
      return rest.length ? { code: code.trim(), text: rest.join("|").trim() } : { code: "", text: code.trim() };
    });
    const body: GuidelineBody = {
      role: String(formData.get("role") ?? "").trim(),
      rules,
      banned: lines(formData.get("banned")),
      outputFormat: String(formData.get("outputFormat") ?? "").trim(),
      examples: String(formData.get("examples") ?? "").trim(),
    };
    if (!body.role) throw new StudioError("역할 설명을 적어 주세요");
    await db.transaction(async (tx) => {
      const [{ v }] = await tx
        .select({ v: max(schema.guidelineVersions.version) })
        .from(schema.guidelineVersions)
        .where(eq(schema.guidelineVersions.guidelineId, id));
      const next = (v ?? 0) + 1;
      await tx.insert(schema.guidelineVersions).values({
        guidelineId: id,
        version: next,
        body,
        note: String(formData.get("note") ?? "").trim(),
      });
      await tx
        .update(schema.guidelines)
        .set({ currentVersion: next, updatedAt: new Date() })
        .where(eq(schema.guidelines.id, id));
      await tx.insert(schema.decisionLedger).values({
        actor: owner.email,
        action: "edit_guideline",
        after: { guidelineId: id, version: next },
        note: String(formData.get("note") ?? ""),
      });
    });
  } catch (e) {
    back(path, e);
  }
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}

export async function restoreGuidelineVersion(formData: FormData) {
  const owner = await requireOwner();
  const id = String(formData.get("id"));
  const version = Number(formData.get("version"));
  const [v] = await db
    .select()
    .from(schema.guidelineVersions)
    .where(and(eq(schema.guidelineVersions.guidelineId, id), eq(schema.guidelineVersions.version, version)));
  if (!v) back(`/studio/guidelines/${id}`, new StudioError("버전을 찾을 수 없어요"));
  await db.update(schema.guidelines).set({ currentVersion: version, updatedAt: new Date() }).where(eq(schema.guidelines.id, id));
  await db.insert(schema.decisionLedger).values({
    actor: owner.email,
    action: "restore_guideline",
    after: { guidelineId: id, version },
  });
  revalidatePath(`/studio/guidelines/${id}`);
  redirect(`/studio/guidelines/${id}?restored=${version}`);
}

export async function createScopedGuideline(formData: FormData) {
  await requireOwner();
  const scope = z.enum(["genre", "series", "episode"]).parse(formData.get("scope"));
  const scopeRef = String(formData.get("scopeRef") ?? "").trim();
  const agent = z.enum(schema.agentKind.enumValues).parse(formData.get("agent"));
  const back_ = String(formData.get("back") ?? "/studio/guidelines");
  if (!scopeRef) back(back_, new StudioError("적용 대상을 골라 주세요"));
  const existing = await db
    .select()
    .from(schema.guidelines)
    .where(and(eq(schema.guidelines.scope, scope), eq(schema.guidelines.scopeRef, scopeRef), eq(schema.guidelines.agent, agent)));
  if (existing[0]) redirect(`/studio/guidelines/${existing[0].id}`);
  const [g] = await db
    .insert(schema.guidelines)
    .values({ scope, scopeRef, agent, title: String(formData.get("title") ?? "") || `${scopeRef} 추가 지침`, currentVersion: 1 })
    .returning();
  await db.insert(schema.guidelineVersions).values({
    guidelineId: g.id,
    version: 1,
    body: { role: "위 단계 지침에 더해 이 범위에만 적용할 내용을 적어요.", rules: [], banned: [], outputFormat: "", examples: "" },
    note: "새 추가 지침",
  });
  redirect(`/studio/guidelines/${g.id}`);
}

/* ─── 작품 ─── */

function slugify(s: string) {
  const ascii = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return ascii || `series-${Date.now().toString(36)}`;
}

export async function createSeries(formData: FormData) {
  const owner = await requireOwner();
  let seriesId = "";
  try {
    const title = String(formData.get("title") ?? "").trim() || "제목 미정";
    const titleEn = String(formData.get("titleEn") ?? "").trim();
    const genre = z.string().min(1).parse(formData.get("genre"));
    const sourceIds = formData.getAll("sourceIds").map(String).filter(Boolean);
    if (sourceIds.length === 0) throw new StudioError("뿌리가 될 소재를 하나 이상 골라 주세요 (R-1)");
    const brief = {
      tone: String(formData.get("tone") ?? ""),
      ageRating: z.enum(["all", "12", "15", "18"]).parse(formData.get("ageRating") ?? "15"),
      audience: String(formData.get("audience") ?? ""),
      memo: String(formData.get("memo") ?? ""),
    };
    const [row] = await db
      .insert(schema.series)
      .values({ title, titleEn, genre, brief, slug: `${slugify(titleEn || title)}-${Date.now().toString(36).slice(-4)}` })
      .returning({ id: schema.series.id });
    seriesId = row.id;
    await db.insert(schema.seriesSources).values(sourceIds.map((sourceId) => ({ seriesId, sourceId, role: "engine" })));
    await startStage({ seriesId, episodeId: null, stage: "concept", actor: owner.email, instruction: brief.memo });
  } catch (e) {
    back("/studio/series/new", e);
  }
  redirect(`/studio/series/${seriesId}`);
}

export async function createEpisode(formData: FormData) {
  await requireOwner();
  const seriesId = String(formData.get("seriesId"));
  const [{ n }] = await db
    .select({ n: max(schema.episodes.number) })
    .from(schema.episodes)
    .where(eq(schema.episodes.seriesId, seriesId));
  const number = (n ?? 0) + 1;
  const [ep] = await db
    .insert(schema.episodes)
    .values({
      seriesId,
      number,
      title: String(formData.get("title") ?? "").trim(),
      logline: String(formData.get("logline") ?? "").trim(),
    })
    .returning({ id: schema.episodes.id });
  // 승인된 스토리의 회차 요약에서 제목(한·영)과 한 줄 요약을 기본값으로 가져와요 (빈 칸만)
  await enqueueJob({ type: "episode_meta", seriesId, episodeId: ep.id });
  redirect(`/studio/series/${seriesId}/episodes/${number}`);
}

/* ─── 단계 진행 ─── */

function stageFrom(v: FormDataEntryValue | null): Stage {
  const s = String(v) as Stage;
  if (!ALL_STAGES.includes(s)) throw new StudioError("알 수 없는 단계예요");
  return s;
}

export async function runStage(formData: FormData) {
  const owner = await requireOwner();
  const path = String(formData.get("back"));
  try {
    await startStage({
      seriesId: String(formData.get("seriesId")),
      episodeId: (formData.get("episodeId") as string) || null,
      stage: stageFrom(formData.get("stage")),
      actor: owner.email,
      instruction: String(formData.get("instruction") ?? "").trim(),
    });
  } catch (e) {
    back(path, e);
  }
  revalidatePath(path);
  redirect(path);
}

/** 작화 결과에서 고른 컷만 다시 그려요. 나머지 컷은 그대로 새 결과물로 옮겨요. */
export async function redrawPanels(formData: FormData) {
  const owner = await requireOwner();
  const path = String(formData.get("back"));
  const panels = formData
    .getAll("panels")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  try {
    if (panels.length === 0) throw new StudioError("다시 그릴 컷을 하나 이상 골라 주세요");
    await startStage({
      seriesId: String(formData.get("seriesId")),
      episodeId: (formData.get("episodeId") as string) || null,
      stage: "art",
      actor: owner.email,
      instruction: String(formData.get("instruction") ?? "").trim(),
      panels,
      baseArtifactId: String(formData.get("artifactId")),
    });
  } catch (e) {
    back(path, e);
  }
  revalidatePath(path);
  redirect(path);
}

/**
 * 작화 시험 컷 다음 단계.
 * - rest: 나머지 컷 그리기
 * - compare: 시험 컷을 여러 모델로 그려 비교
 * - adopt: 비교한 모델 중 하나로 정하고(작품 설정에 저장) 나머지 컷 그리기
 */
export async function artNextStep(formData: FormData) {
  const owner = await requireOwner();
  const path = String(formData.get("back"));
  const mode = String(formData.get("mode"));
  const seriesId = String(formData.get("seriesId"));
  const nums = (key: string) =>
    String(formData.get(key) ?? "")
      .split(",")
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
  const known = new Set<string>(IMAGE_MODELS.map((m) => m.id));
  try {
    let panels: number[] = [];
    let extra: Record<string, unknown> = {};
    if (mode === "rest") {
      panels = nums("pending");
      if (!panels.length) throw new StudioError("남은 컷이 없어요");
      // 한 장씩 확인할 장면: 고른 장면은 한 컷씩 그리고 멈춰요 (고른 것이 없으면 모두 자동으로)
      if (formData.get("step_choice")) {
        extra = {
          step_scenes: formData
            .getAll("step_scenes")
            .map(Number)
            .filter((n) => Number.isInteger(n) && n > 0),
        };
      }
      // 시험 컷이 하나도 합격하지 못했으면 나머지도 같은 이유로 떨어져요. 돈을 쓰기 전에 막아요.
      const [base] = await db
        .select({ body: schema.artifacts.body })
        .from(schema.artifacts)
        .where(eq(schema.artifacts.id, String(formData.get("artifactId"))));
      const gate = restGate(base?.body, panels.length);
      if (gate.blocked)
        throw new StudioError(
          `시험 컷 ${gate.total}장이 모두 떨어졌어요. 이대로 나머지를 그리면 약 $${gate.estimate}를 쓰고도 같은 문제로 떨어질 가능성이 높아요. ` +
            "④+ 인물 시트를 먼저 고치거나, 시험 컷을 다시 그려 합격시킨 뒤 나머지를 그려 주세요",
        );
    } else if (mode === "compare") {
      const models = formData.getAll("models").map(String).filter((m) => known.has(m));
      if (models.length < 2) throw new StudioError("비교할 모델을 두 개 이상 골라 주세요");
      panels = nums("test");
      extra = { compare_models: models };
    } else if (mode === "adopt") {
      const model = String(formData.get("model"));
      if (!known.has(model)) throw new StudioError("모르는 그림 모델이에요");
      const [s] = await db.select({ brief: schema.series.brief }).from(schema.series).where(eq(schema.series.id, seriesId));
      if (!s) throw new StudioError("작품을 찾을 수 없어요");
      await db.update(schema.series).set({ brief: { ...s.brief, imageModel: model } }).where(eq(schema.series.id, seriesId));
      panels = nums("pending");
      extra = { adopt_model: model };
      if (!panels.length) {
        // 남은 컷이 없으면 시험 컷만 고른 모델 그림으로 바꿔 끝내요 (그리는 비용 없음)
        panels = nums("test");
        extra = { adopt_model: model, keep_adopted: true };
      }
    } else {
      throw new StudioError("모르는 동작이에요");
    }
    if (!panels.length) throw new StudioError("그릴 컷이 없어요");
    await startStage({
      seriesId,
      episodeId: (formData.get("episodeId") as string) || null,
      stage: "art",
      actor: owner.email,
      instruction: "",
      panels,
      baseArtifactId: String(formData.get("artifactId")),
      extra,
    });
  } catch (e) {
    back(path, e);
  }
  revalidatePath(path);
  redirect(path);
}

const REF_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** 작화 컷에 대표 판정(좋아요 / AI 같아요)을 남겨요. 다음 작화부터 검사기가 이 판정을 사례로 배워요. 돈이 들지 않아요. */
export async function judgePanel(formData: FormData) {
  await requireOwner();
  const path = String(formData.get("back"));
  const id = String(formData.get("artifactId"));
  const [idx, v] = String(formData.get("judge") ?? "").split(":");
  const index = Number(idx);
  const verdict: Verdict | null = v === "good" || v === "ai" ? v : null;
  try {
    const [a] = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, id));
    if (!a) throw new StudioError("결과물을 찾을 수 없어요");
    const body = setVerdict(a.body, index, verdict, String(formData.get(`judge_note_${index}`) ?? ""));
    await db.update(schema.artifacts).set({ body }).where(eq(schema.artifacts.id, id));
  } catch (e) {
    back(path, e);
  }
  revalidatePath(path);
  redirect(path);
}

/**
 * 핵심 컷 손보기: 대표(또는 외주 작가)가 내려받아 고친 그림을 올리면 그 컷 그림을 바꿔요.
 * 원래 그림은 raw_image로 남기고, 무엇을 바꿨는지 제작 원장에 적어요. 결과물은 검토 대기 그대로예요.
 */
export async function uploadPanelImage(formData: FormData) {
  const owner = await requireOwner();
  const path = String(formData.get("back"));
  const id = String(formData.get("artifactId"));
  const index = Number(formData.get("index"));
  try {
    // 컷 목록 안의 버튼으로 보내서, 그 컷의 파일 칸(file_N)을 읽어요
    const f = formData.get(`file_${index}`) ?? formData.get("file");
    if (!(f instanceof File) || f.size === 0) throw new StudioError("올릴 그림을 골라 주세요");
    const ext = REF_TYPES[f.type];
    if (!ext) throw new StudioError("PNG, JPG, WEBP 그림만 올릴 수 있어요");
    if (f.size > 15 * 1024 * 1024) throw new StudioError("한 장에 15MB까지 올릴 수 있어요");
    const [a] = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, id));
    if (!a) throw new StudioError("결과물을 찾을 수 없어요");
    if (a.status === "generating") throw new StudioError("그리는 중에는 바꿀 수 없어요");
    const key = `series/${a.seriesId}/hand/${a.id}/${String(index).padStart(3, "0")}-${crypto.randomUUID()}.${ext}`;
    const body = replacePanel(a.body, index, key);
    await putPublic(key, new Uint8Array(await f.arrayBuffer()), f.type);
    await db.update(schema.artifacts).set({ body, updatedAt: new Date() }).where(eq(schema.artifacts.id, id));
    await db.insert(schema.decisionLedger).values({
      artifactId: id,
      seriesId: a.seriesId,
      actor: owner.email,
      action: "edit",
      before: a.body,
      after: body,
      note: `${index}컷 그림을 손으로 고친 그림으로 바꿨어요` + (String(formData.get("note") ?? "").trim() ? `: ${String(formData.get("note")).trim()}` : ""),
    });
  } catch (e) {
    back(path, e);
  }
  revalidatePath(path);
  redirect(path);
}

/** ④ 화풍 기준 그림 올리기·빼기. 참고 캡처는 기준 값 분석에만, 대표가 그린 그림(kind=own)은 그림 모델이 직접 보고 따라 그려요. */
export async function updateStyleRefs(formData: FormData) {
  await requireOwner();
  const path = String(formData.get("back"));
  const seriesId = String(formData.get("seriesId"));
  try {
    const [s] = await db.select({ brief: schema.series.brief }).from(schema.series).where(eq(schema.series.id, seriesId));
    if (!s) throw new StudioError("작품을 찾을 수 없어요");
    // kind=own: 대표가 직접 그린 그림 (그림 모델이 직접 보고 따라 그려요). 그 밖: 참고 웹툰 캡처 (기준 값 분석에만)
    const own = String(formData.get("kind") ?? "") === "own";
    const limit = own ? 3 : 8;
    let refs = [...((own ? s.brief.ownArt : s.brief.styleRefs) ?? [])];
    const remove = String(formData.get("remove") ?? "");
    if (remove) {
      refs = refs.filter((r) => r !== remove);
    } else {
      const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
      if (!files.length) throw new StudioError("올릴 그림을 골라 주세요");
      if (refs.length + files.length > limit) throw new StudioError(own ? "내 그림은 3장까지예요" : "참고 캡처는 8장까지예요");
      for (const f of files) {
        const ext = REF_TYPES[f.type];
        if (!ext) throw new StudioError("PNG, JPG, WEBP 그림만 올릴 수 있어요");
        if (f.size > 5 * 1024 * 1024) throw new StudioError("한 장에 5MB까지 올릴 수 있어요");
        const key = `series/${seriesId}/${own ? "own-art" : "style-refs"}/${crypto.randomUUID()}.${ext}`;
        await putPrivate(key, new Uint8Array(await f.arrayBuffer()), f.type);
        refs.push(key);
      }
    }
    await db
      .update(schema.series)
      .set({ brief: { ...s.brief, ...(own ? { ownArt: refs } : { styleRefs: refs }) } })
      .where(eq(schema.series.id, seriesId));
  } catch (e) {
    back(path, e);
  }
  revalidatePath(path);
  redirect(path);
}

/** ④+ 인물 시트에 참조로 넣을 고증 참고 그림(유물·복식 사진) 올리기·빼기. 비공개로 두고 시트를 그릴 때만 그림 모델에 보내요. */
export async function updateHistoryRefs(formData: FormData) {
  await requireOwner();
  const path = String(formData.get("back"));
  const seriesId = String(formData.get("seriesId"));
  try {
    const [s] = await db.select({ brief: schema.series.brief }).from(schema.series).where(eq(schema.series.id, seriesId));
    if (!s) throw new StudioError("작품을 찾을 수 없어요");
    let refs = [...(s.brief.historyRefs ?? [])];
    const remove = String(formData.get("remove") ?? "");
    if (remove) {
      refs = refs.filter((r) => r !== remove);
    } else {
      const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
      if (!files.length) throw new StudioError("올릴 그림을 골라 주세요");
      if (refs.length + files.length > 3) throw new StudioError("고증 참고 그림은 3장까지예요");
      for (const f of files) {
        const ext = REF_TYPES[f.type];
        if (!ext) throw new StudioError("PNG, JPG, WEBP 그림만 올릴 수 있어요");
        if (f.size > 5 * 1024 * 1024) throw new StudioError("한 장에 5MB까지 올릴 수 있어요");
        const key = `series/${seriesId}/history-refs/${crypto.randomUUID()}.${ext}`;
        await putPrivate(key, new Uint8Array(await f.arrayBuffer()), f.type);
        refs.push(key);
      }
    }
    await db.update(schema.series).set({ brief: { ...s.brief, historyRefs: refs } }).where(eq(schema.series.id, seriesId));
  } catch (e) {
    back(path, e);
  }
  revalidatePath(path);
  redirect(path);
}

/** ④+ 인물 시트에서 고른 인물만 다시 그려요. 외모 명세는 그대로, 지시는 그 인물들에게만 들어가요. */
export async function redrawSheets(formData: FormData) {
  const owner = await requireOwner();
  const path = String(formData.get("back"));
  const chars = formData.getAll("chars").map(String).filter((c) => /^[a-z0-9_-]{1,40}$/.test(c));
  try {
    if (!chars.length) throw new StudioError("다시 그릴 인물을 하나 이상 골라 주세요");
    await startStage({
      seriesId: String(formData.get("seriesId")),
      episodeId: null,
      stage: "sheets",
      actor: owner.email,
      instruction: String(formData.get("instruction") ?? "").trim(),
      baseArtifactId: String(formData.get("artifactId")),
      extra: { chars, base_artifact_id: String(formData.get("artifactId")) },
    });
  } catch (e) {
    back(path, e);
  }
  revalidatePath(path);
  redirect(path);
}

type PartsBody = {
  kind?: string;
  phase?: string;
  parts?: { id: string; name: string; variants: { image: string }[]; locked?: string | null }[];
  summary?: Record<string, number>;
};

/** ④+ 부품: 대표가 부품마다 후보를 골라 잠가요. '인물 시트 그리기'를 누르면 모두 잠겼는지 확인하고 잠근 부품으로 인물 시트를 그려요. */
export async function lockParts(formData: FormData) {
  const owner = await requireOwner();
  const path = String(formData.get("back"));
  const id = String(formData.get("artifactId"));
  const seriesId = String(formData.get("seriesId"));
  const compose = formData.get("intent") === "compose";
  try {
    const [a] = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, id));
    const body = a?.body as PartsBody | undefined;
    if (!a || body?.kind !== "sheets" || body.phase !== "parts" || !body.parts) throw new StudioError("부품을 고르는 결과물이 아니에요");
    if (a.status !== "pending_review") throw new StudioError("검토 대기 중인 결과물에서만 부품을 고를 수 있어요");
    const parts = body.parts.map((p) => {
      const pick = String(formData.get(`pick:${p.id}`) ?? "");
      return p.variants.some((v) => v.image === pick) ? { ...p, locked: pick } : p;
    });
    const locked = parts.filter((p) => p.locked).length;
    await db
      .update(schema.artifacts)
      .set({ body: { ...(a.body as Record<string, unknown>), parts, summary: { ...(body.summary ?? {}), parts_locked: locked } } })
      .where(eq(schema.artifacts.id, id));
    if (compose) {
      const missing = parts.filter((p) => !p.locked).map((p) => p.name);
      if (missing.length) throw new StudioError(`아직 고르지 않은 부품이 있어요: ${missing.join(", ")}`);
      await startStage({
        seriesId,
        episodeId: null,
        stage: "sheets",
        actor: owner.email,
        instruction: "",
        baseArtifactId: id,
        extra: { mode: "compose", base_artifact_id: id },
      });
    }
  } catch (e) {
    back(path, e);
  }
  revalidatePath(path);
  redirect(path);
}

/** ④+ 부품: 마음에 드는 후보가 없는 부품만 후보 4장을 다시 그려요. 다른 부품의 잠금은 그대로예요. */
export async function redrawParts(formData: FormData) {
  const owner = await requireOwner();
  const path = String(formData.get("back"));
  const id = String(formData.get("artifactId"));
  const parts = formData.getAll("parts").map(String).filter((p) => /^[a-z0-9_-]{1,60}$/.test(p));
  try {
    if (!parts.length) throw new StudioError("후보를 다시 그릴 부품을 하나 이상 골라 주세요");
    await startStage({
      seriesId: String(formData.get("seriesId")),
      episodeId: null,
      stage: "sheets",
      actor: owner.email,
      instruction: String(formData.get("instruction") ?? "").trim(),
      baseArtifactId: id,
      extra: { mode: "parts", parts, base_artifact_id: id },
    });
  } catch (e) {
    back(path, e);
  }
  revalidatePath(path);
  redirect(path);
}

/** 인물 시트를 고치며 나온 대표 교정을 작품 지침에 규칙(W-n)으로 더해요.
 *  캐릭터·작화 디렉터·작화·검수 지침에 같이 들어가서, 이후 모든 단계와 회차가 지키고 검사해요. */
export async function addSeriesRules(formData: FormData) {
  const owner = await requireOwner();
  const path = String(formData.get("back"));
  const seriesId = String(formData.get("seriesId"));
  const rules = formData
    .getAll("rules")
    .map((r) => String(r).trim())
    .filter((r) => r && r.length <= 400)
    .slice(0, 10);
  try {
    if (!rules.length) throw new StudioError("추가할 규칙을 하나 이상 골라 주세요");
    const [s] = await db.select({ title: schema.series.title }).from(schema.series).where(eq(schema.series.id, seriesId));
    if (!s) throw new StudioError("작품을 찾을 수 없어요");
    await db.transaction(async (tx) => {
      for (const agent of ["character", "art_director", "artist", "reviewer"] as const) {
        let [g] = await tx
          .select()
          .from(schema.guidelines)
          .where(and(eq(schema.guidelines.scope, "series"), eq(schema.guidelines.scopeRef, seriesId), eq(schema.guidelines.agent, agent)));
        if (!g) {
          [g] = await tx
            .insert(schema.guidelines)
            .values({ scope: "series", scopeRef: seriesId, agent, title: `${s.title} 작품 지침`, currentVersion: 0 })
            .returning();
        }
        const [latest] = await tx
          .select()
          .from(schema.guidelineVersions)
          .where(eq(schema.guidelineVersions.guidelineId, g.id))
          .orderBy(desc(schema.guidelineVersions.version))
          .limit(1);
        const body: GuidelineBody = latest?.body ?? {
          role: "위 단계 지침에 더해 이 작품에만 적용할 내용이에요.",
          rules: [],
          banned: [],
          outputFormat: "",
          examples: "",
        };
        const have = new Set(body.rules.map((r) => r.text));
        let n = body.rules.filter((r) => /^W-\d+$/.test(r.code)).length;
        const add = rules.filter((t) => !have.has(t)).map((text) => ({ code: `W-${++n}`, text }));
        if (!add.length) continue;
        const version = (latest?.version ?? 0) + 1;
        await tx.insert(schema.guidelineVersions).values({
          guidelineId: g.id,
          version,
          body: { ...body, rules: [...body.rules, ...add] },
          note: "인물 시트 교정에서 추가",
        });
        await tx.update(schema.guidelines).set({ currentVersion: version, updatedAt: new Date() }).where(eq(schema.guidelines.id, g.id));
      }
      await tx.insert(schema.decisionLedger).values({
        actor: owner.email,
        action: "add_series_rules",
        after: { seriesId, rules },
      });
    });
  } catch (e) {
    back(path, e);
  }
  revalidatePath(path);
  redirect(`${path}${path.includes("?") ? "&" : "?"}rules=1`);
}

/** 회차 제작비 상한(달러)을 정해요. 작품의 모든 회차에 같이 적용돼요. 0이면 상한 없음. */
export async function setEpisodeBudget(formData: FormData) {
  await requireOwner();
  const path = String(formData.get("back"));
  const seriesId = String(formData.get("seriesId"));
  try {
    const v = Number(formData.get("budget"));
    if (!Number.isFinite(v) || v < 0 || v > 1000) throw new StudioError("0~1000 사이 금액(달러)을 넣어 주세요");
    const [s] = await db.select({ brief: schema.series.brief }).from(schema.series).where(eq(schema.series.id, seriesId));
    if (!s) throw new StudioError("작품을 찾을 수 없어요");
    await db.update(schema.series).set({ brief: { ...s.brief, episodeBudgetUsd: Math.round(v * 100) / 100 } }).where(eq(schema.series.id, seriesId));
  } catch (e) {
    back(path, e);
  }
  revalidatePath(path);
  redirect(path);
}

/** 작품의 그림 모델을 정해요. ④ 화풍 샘플과 ⑦ 작화가 이 모델로 그려요. 빈 값이면 작업 서버 기본 모델. */
export async function setImageModel(formData: FormData) {
  await requireOwner();
  const path = String(formData.get("back"));
  const seriesId = String(formData.get("seriesId"));
  try {
    const model = String(formData.get("model") ?? "");
    if (model && !IMAGE_MODELS.some((m) => m.id === model)) throw new StudioError("알 수 없는 그림 모델이에요");
    const [s] = await db.select({ brief: schema.series.brief }).from(schema.series).where(eq(schema.series.id, seriesId));
    if (!s) throw new StudioError("작품을 찾을 수 없어요");
    const brief = { ...s.brief };
    if (model) brief.imageModel = model;
    else delete brief.imageModel;
    await db.update(schema.series).set({ brief }).where(eq(schema.series.id, seriesId));
  } catch (e) {
    back(path, e);
  }
  revalidatePath(path);
  redirect(path);
}

/** ④ 화풍: 승인한 ①~③에 맞는 시장 웹툰을 AI가 웹에서 찾아 화풍 특징을 정리해요. */
export async function findStyleWorks(formData: FormData) {
  await requireOwner();
  const path = String(formData.get("back"));
  const seriesId = String(formData.get("seriesId"));
  try {
    const [concept] = await db
      .select({ id: schema.artifacts.id })
      .from(schema.artifacts)
      .where(
        and(
          eq(schema.artifacts.seriesId, seriesId),
          isNull(schema.artifacts.episodeId),
          eq(schema.artifacts.stage, "concept"),
          inArray(schema.artifacts.status, ["approved", "edited"]),
        ),
      )
      .limit(1);
    if (!concept) throw new StudioError("① 기획안을 먼저 승인해 주세요");
    const busy = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.type, "style_scout"), eq(schema.jobs.seriesId, seriesId), inArray(schema.jobs.status, ["queued", "running"])));
    if (!busy.length) await enqueueJob({ type: "style_scout", seriesId });
  } catch (e) {
    back(path, e);
  }
  revalidatePath(path);
  redirect(path);
}

/** ④ 화풍: 찾은 웹툰 중 참고할 화풍을 최대 3개 골라요. 고른 작품의 특징만 화풍 후보에 반영돼요. */
export async function setStyleChoice(formData: FormData) {
  await requireOwner();
  const path = String(formData.get("back"));
  const seriesId = String(formData.get("seriesId"));
  try {
    const [s] = await db.select({ brief: schema.series.brief }).from(schema.series).where(eq(schema.series.id, seriesId));
    if (!s) throw new StudioError("작품을 찾을 수 없어요");
    const n = s.brief.styleSuggestions?.works.length ?? 0;
    const picked = [...new Set(formData.getAll("pick").map(Number))].filter((i) => Number.isInteger(i) && i >= 0 && i < n);
    if (picked.length > 3) throw new StudioError("참고 화풍은 3개까지 고를 수 있어요");
    await db.update(schema.series).set({ brief: { ...s.brief, styleChoice: picked } }).where(eq(schema.series.id, seriesId));
  } catch (e) {
    back(path, e);
  }
  revalidatePath(path);
  redirect(path);
}

function masterBlocked(cands: { samples: (string | null)[]; sample_issues?: { severity: string }[][] }[]): Set<string> {
  const out = new Set<string>();
  for (const c of cands)
    c.samples.forEach((k, si) => {
      if (k && c.sample_issues?.[si]?.some((x) => x.severity === "critical")) out.add(k);
    });
  return out;
}

/** ④ 화풍: 후보 하나와 화풍 마스터 그림을 골라 승인해요. 마스터는 ⑦ 작화의 모든 컷에 화풍 참조로 들어가요. */
export async function approveStyle(formData: FormData) {
  const owner = await requireOwner();
  const path = String(formData.get("back"));
  const id = String(formData.get("artifactId"));
  try {
    const [a] = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, id));
    const body = a?.body as
      | { kind?: string; candidates?: { samples: (string | null)[]; sample_issues?: { item: string; severity: string }[][] }[] }
      | undefined;
    if (!a || body?.kind !== "style" || !body.candidates) throw new StudioError("화풍 샘플이 있는 결과물이 아니에요");
    const samples = new Set(body.candidates.flatMap((c) => c.samples.filter(Boolean) as string[]));
    const masters = formData.getAll("masters").map(String).filter((k) => samples.has(k));
    if (masters.length < 1 || masters.length > 5) throw new StudioError("화풍 마스터로 쓸 그림을 1~5장 골라 주세요");
    // 시대 검사에서 치명 문제가 나온 그림은 마스터가 될 수 없어요. 이후 모든 인물과 컷이 그 옷·머리·소품을 따라 그려요.
    const blocked = masterBlocked(body.candidates);
    if (masters.some((k) => blocked.has(k)))
      throw new StudioError("'고르지 마세요' 표시가 있는 그림은 화풍 마스터로 쓸 수 없어요. 표시 없는 그림을 골라 주세요");
    const chosen = body.candidates.findIndex((c) => c.samples.includes(masters[0]));
    await db
      .update(schema.artifacts)
      .set({ body: { ...(a.body as Record<string, unknown>), chosen, style_masters: masters } })
      .where(eq(schema.artifacts.id, id));
    await approveArtifact(id, owner.email, `화풍 후보 ${chosen + 1}, 마스터 ${masters.length}장`);
  } catch (e) {
    back(path, e);
  }
  revalidatePath(path);
  redirect(path);
}

export async function decideArtifact(formData: FormData) {
  const owner = await requireOwner();
  const path = String(formData.get("back"));
  const id = String(formData.get("artifactId"));
  const decision = String(formData.get("decision"));
  const note = String(formData.get("note") ?? "").trim();
  try {
    if (decision === "approve") await approveArtifact(id, owner.email, note);
    else if (decision === "reject") await rejectArtifact(id, owner.email, note);
    else if (decision === "edit") {
      const raw = String(formData.get("body") ?? "");
      const format = String(formData.get("format") ?? "markdown");
      let body: Record<string, unknown>;
      if (format === "fields") {
        // 입력란으로 고친 칸만 원래 결과에 넣어요
        const [a] = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, id));
        if (!a) throw new StudioError("결과물을 찾을 수 없어요");
        const fields = new Map<string, string>();
        for (const [k, v] of formData.entries()) if (/^p\d+\./.test(k) && typeof v === "string") fields.set(k, v);
        try {
          body = applyFields(a.body as Record<string, unknown>, fields);
        } catch (e) {
          throw new StudioError(e instanceof Error ? e.message : "고칠 수 없는 결과예요");
        }
      } else if (format === "json") {
        try {
          body = JSON.parse(raw);
        } catch {
          throw new StudioError("JSON 형식이 맞지 않아요");
        }
      } else {
        const [a] = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, id));
        body = { ...(a?.body ?? {}), markdown: raw };
      }
      await editArtifact(id, owner.email, body, note);
    } else throw new StudioError("알 수 없는 결정이에요");
  } catch (e) {
    back(path, e);
  }
  revalidatePath(path);
  redirect(path);
}

export async function retryJob(formData: FormData) {
  await requireOwner();
  const id = String(formData.get("jobId"));
  await db
    .update(schema.jobs)
    .set({ status: "queued", error: null, runAfter: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.jobs.id, id), eq(schema.jobs.status, "failed")));
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  if (job?.artifactId) {
    await db.update(schema.artifacts).set({ status: "generating" }).where(eq(schema.artifacts.id, job.artifactId));
  }
  if (job?.type === "scout") {
    await db.update(schema.scoutRuns).set({ status: "running", error: null, updatedAt: new Date() }).where(eq(schema.scoutRuns.jobId, id));
  }
  if (job) await notifyWorker(id);
  revalidatePath("/studio/jobs");
  redirect("/studio/jobs");
}

/** 멈춘 작업을 같은 결과물로 다시 시작해요. 끝난 컷·후보는 저장돼 있어서 다음 것부터 이어 가요. */
export async function resumeJob(formData: FormData) {
  await requireOwner();
  const path = String(formData.get("back") || "/studio/jobs");
  const id = String(formData.get("jobId"));
  const [job] = await db
    .update(schema.jobs)
    .set({ status: "queued", error: null, attempts: 0, runAfter: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.jobs.id, id), eq(schema.jobs.status, "failed")))
    .returning();
  if (job?.artifactId) {
    await db.update(schema.artifacts).set({ status: "generating" }).where(eq(schema.artifacts.id, job.artifactId));
  }
  if (job) await notifyWorker(id);
  revalidatePath(path);
  redirect(path);
}

/* ─── 연재 ─── */

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export async function saveSeriesPublic(formData: FormData) {
  await requireOwner();
  const id = String(formData.get("seriesId"));
  const path = `/studio/series/${id}`;
  const str = (k: string, max = 2000) => String(formData.get(k) ?? "").trim().slice(0, max);
  const cover = str("coverUrl", 500);
  if (cover && !/^series\/[\w./-]+\.(png|jpe?g|webp)$/.test(cover)) back(path, new StudioError("표지는 작품 그림 중에서 골라 주세요"));
  await db
    .update(schema.series)
    .set({
      ...(str("title", 200) ? { title: str("title", 200) } : {}),
      titleEn: str("titleEn", 200),
      logline: str("logline"),
      loglineEn: str("loglineEn"),
      rootNote: str("rootNote"),
      rootNoteEn: str("rootNoteEn"),
      scheduleDays: formData.getAll("scheduleDays").map(String).filter((d) => DAYS.includes(d)),
      coverUrl: cover,
      updatedAt: new Date(),
    })
    .where(eq(schema.series.id, id));
  revalidatePath(path);
  revalidatePath("/");
  redirect(`${path}?saved=1`);
}

export async function publishEpisodeAction(formData: FormData) {
  const owner = await requireOwner();
  const path = String(formData.get("back"));
  const episodeId = String(formData.get("episodeId"));
  try {
    if (formData.get("decision") === "unpublish") await unpublishEpisode(episodeId, owner.email);
    else {
      const at = String(formData.get("publishAt") ?? "").trim();
      // 입력은 한국 시간 기준 (datetime-local)
      const when = at ? new Date(`${at}:00+09:00`) : undefined;
      if (when && Number.isNaN(when.getTime())) throw new StudioError("공개 시각을 확인해 주세요");
      await publishEpisode(episodeId, owner.email, when);
    }
  } catch (e) {
    back(path, e);
  }
  revalidatePath(path);
  revalidatePath("/");
  redirect(path);
}

export async function saveEpisodeInfo(formData: FormData) {
  await requireOwner();
  const path = String(formData.get("back"));
  await db
    .update(schema.episodes)
    .set({
      title: String(formData.get("title") ?? "").trim().slice(0, 200),
      titleEn: String(formData.get("titleEn") ?? "").trim().slice(0, 200),
      updatedAt: new Date(),
    })
    .where(eq(schema.episodes.id, String(formData.get("episodeId"))));
  revalidatePath(path);
  redirect(path);
}

/** 회차 제목·요약을 승인된 스토리에서 다시 가져와요 (빈 칸만). */
export async function fillEpisodeMeta(formData: FormData) {
  await requireOwner();
  const path = String(formData.get("back"));
  const seriesId = String(formData.get("seriesId"));
  const episodeId = String(formData.get("episodeId"));
  const busy = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.type, "episode_meta"), eq(schema.jobs.episodeId, episodeId), inArray(schema.jobs.status, ["queued", "running"])));
  if (!busy.length) await enqueueJob({ type: "episode_meta", seriesId, episodeId });
  revalidatePath(path);
  redirect(path);
}

/** 승인한 기획안·스토리·인물로 연재 설정의 빈 칸(제목, 소개, 뿌리 노트)을 AI가 채워요. */
export async function fillSeriesMeta(formData: FormData) {
  await requireOwner();
  const id = String(formData.get("seriesId"));
  const path = `/studio/series/${id}`;
  try {
    const busy = await db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.type, "series_meta"), eq(schema.jobs.seriesId, id), inArray(schema.jobs.status, ["queued", "running"])));
    if (!busy.length) await enqueueJob({ type: "series_meta", seriesId: id });
  } catch (e) {
    back(path, e);
  }
  revalidatePath(path);
  redirect(`${path}?metaFilling=1#settings`);
}

/* ─── 소재 발굴 (시장 분석 → 소재 후보) ─── */

export async function startScout(formData: FormData) {
  await requireOwner();
  const focus = String(formData.get("focus") ?? "").trim().slice(0, 500);
  try {
    const running = await db
      .select({ id: schema.scoutRuns.id })
      .from(schema.scoutRuns)
      .where(eq(schema.scoutRuns.status, "running"));
    if (running.length) throw new StudioError("이미 조사가 진행 중이에요. 끝나면 다시 실행해 주세요.");
    const [job] = await db.insert(schema.jobs).values({ type: "scout", payload: { focus } }).returning({ id: schema.jobs.id });
    const [run] = await db.insert(schema.scoutRuns).values({ jobId: job.id, trigger: "manual", focus }).returning({ id: schema.scoutRuns.id });
    await db.update(schema.jobs).set({ payload: { focus, run_id: run.id } }).where(eq(schema.jobs.id, job.id));
    await notifyWorker(job.id);
  } catch (e) {
    back("/studio/scout", e);
  }
  revalidatePath("/studio/scout");
  redirect("/studio/scout?started=1");
}

async function adopt(candidateId: string): Promise<string> {
  const [c] = await db.select().from(schema.sourceCandidates).where(eq(schema.sourceCandidates.id, candidateId));
  if (!c) throw new StudioError("후보를 찾지 못했어요");
  if (c.sourceId) return c.sourceId;
  const b = c.body;
  const [src] = await db
    .insert(schema.sources)
    .values({
      name: b.name,
      category: b.category,
      era: b.era,
      summary: b.summary,
      rules: b.rules,
      visualNotes: b.visualNotes,
      references: [...b.references, ...b.evidence.map((e) => e.url)].filter((v, i, a) => v && a.indexOf(v) === i),
      caution: [b.caution, ...b.factCheck].filter(Boolean).join("\n"),
      overlapWorks: [...b.overlapWorks, ...b.similarHits].filter((v, i, a) => v && a.indexOf(v) === i),
    })
    .returning({ id: schema.sources.id });
  await db
    .update(schema.sourceCandidates)
    .set({ status: "adopted", sourceId: src.id, updatedAt: new Date() })
    .where(eq(schema.sourceCandidates.id, candidateId));
  return src.id;
}

/** 후보를 소재 라이브러리에 넣어요. plan=1이면 바로 새 작품 기획 화면으로 가요. */
export async function adoptCandidate(formData: FormData) {
  await requireOwner();
  const id = String(formData.get("id"));
  const plan = formData.get("plan") === "1";
  let sourceId = "";
  try {
    sourceId = await adopt(id);
  } catch (e) {
    back("/studio/scout", e);
  }
  revalidatePath("/studio/scout");
  revalidatePath("/studio/sources");
  redirect(plan ? `/studio/series/new?candidate=${id}` : `/studio/scout?adopted=${sourceId}`);
}

/** 넘긴 이유는 다음 조사에 전달돼서 비슷한 후보가 덜 나와요. */
export async function dismissCandidate(formData: FormData) {
  await requireOwner();
  const id = String(formData.get("id"));
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  await db
    .update(schema.sourceCandidates)
    .set({ status: "dismissed", dismissReason: reason, updatedAt: new Date() })
    .where(and(eq(schema.sourceCandidates.id, id), eq(schema.sourceCandidates.status, "pending")));
  revalidatePath("/studio/scout");
  redirect("/studio/scout");
}
