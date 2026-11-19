"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, max, sql } from "drizzle-orm";
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
import { ALL_STAGES, type Stage } from "@/lib/pipeline";
import { publishEpisode, unpublishEpisode } from "@/lib/studio-publish";
import { enqueueJob, notifyWorker } from "@/lib/queue";
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
  if (!(await checkCredentials(email, password))) {
    redirect("/studio/login?error=1");
  }
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
  await db.insert(schema.episodes).values({
    seriesId,
    number,
    title: String(formData.get("title") ?? "").trim(),
    logline: String(formData.get("logline") ?? "").trim(),
  });
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
      if (format === "json") {
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
