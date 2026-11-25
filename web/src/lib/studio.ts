import "server-only";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  allDownstream,
  canApprove,
  canStart,
  inputHash,
  isSeriesStage,
  nextToEnqueue,
  STAGE_INFO,
  extraGuidelineAgents,
  sheetBlockers,
  stagesFor,
  type SeriesFormat,
  UPSTREAM,
  type LatestArtifact,
  type Stage,
} from "./pipeline";
import { enqueueJob } from "./queue";

const { artifacts, guidelines, guidelineVersions, decisionLedger, series } = schema;

export type Artifact = typeof artifacts.$inferSelect;

/** 단계마다 가장 최근 결과물. 회차를 주면 작품 단계 + 그 회차의 단계를 함께 돌려줘요. */
export async function latestArtifacts(
  seriesId: string,
  episodeId: string | null,
): Promise<Partial<Record<Stage, Artifact>>> {
  const rows = await db
    .select()
    .from(artifacts)
    .where(
      and(
        eq(artifacts.seriesId, seriesId),
        episodeId ? or(isNull(artifacts.episodeId), eq(artifacts.episodeId, episodeId)) : isNull(artifacts.episodeId),
      ),
    )
    .orderBy(desc(artifacts.createdAt));
  const out: Partial<Record<Stage, Artifact>> = {};
  for (const r of rows) {
    const s = r.stage as Stage;
    if (!out[s]) out[s] = r;
  }
  return out;
}

function asLatest(m: Partial<Record<Stage, Artifact>>): Partial<Record<Stage, LatestArtifact>> {
  const out: Partial<Record<Stage, LatestArtifact>> = {};
  for (const [k, v] of Object.entries(m)) {
    if (v) out[k as Stage] = { id: v.id, stage: v.stage as Stage, status: v.status };
  }
  return out;
}

/** 에이전트에게 적용할 지침의 현재 버전들 (전체 < 장르 < 작품 < 회차 순서) */
export async function resolveGuidelineVersions(
  agent: string,
  genre: string,
  seriesId: string,
  episodeId: string | null,
) {
  const scopes = [
    and(eq(guidelines.scope, "global")),
    and(eq(guidelines.scope, "genre"), eq(guidelines.scopeRef, genre)),
    and(eq(guidelines.scope, "series"), eq(guidelines.scopeRef, seriesId)),
    ...(episodeId ? [and(eq(guidelines.scope, "episode"), eq(guidelines.scopeRef, episodeId))] : []),
  ];
  const rows = await db
    .select({ g: guidelines, v: guidelineVersions })
    .from(guidelines)
    .innerJoin(
      guidelineVersions,
      and(eq(guidelineVersions.guidelineId, guidelines.id), eq(guidelineVersions.version, guidelines.currentVersion)),
    )
    .where(and(eq(guidelines.agent, agent as typeof guidelines.agent.enumValues[number]), or(...scopes)));
  const order = { global: 0, genre: 1, series: 2, episode: 3 } as const;
  return rows.sort((a, b) => order[a.g.scope] - order[b.g.scope]);
}

export class StudioError extends Error {}

export const DEFAULT_EPISODE_BUDGET = 40;
const usd = (n: number) => "$" + n.toFixed(2);

/** 회차에 지금까지 든 제작비 (달러) */
export async function episodeCost(episodeId: string): Promise<number> {
  const [r] = await db
    .select({ total: sql<string>`coalesce(sum(${schema.costLedger.costUsd}), 0)` })
    .from(schema.costLedger)
    .where(eq(schema.costLedger.episodeId, episodeId));
  return Number(r?.total ?? 0);
}

/** 단계를 시작(또는 다시 생성)해요. 결과물 자리를 만들고 작업을 큐에 넣어요. */
export async function startStage(opts: {
  seriesId: string;
  episodeId: string | null;
  stage: Stage;
  actor: string;
  instruction?: string;
  /** 작화에서 고른 컷만 다시 그릴 때: 컷 번호와 바탕이 되는 작화 결과물 */
  panels?: number[];
  baseArtifactId?: string;
  /** 작업에 함께 넘길 값 (작화: 비교할 모델, 고른 모델) */
  extra?: Record<string, unknown>;
}): Promise<string> {
  const { seriesId, stage, actor } = opts;
  const episodeId = isSeriesStage(stage) ? null : opts.episodeId;
  if (!isSeriesStage(stage) && !episodeId) throw new StudioError("회차 단계에는 회차가 필요해요");

  const [s] = await db.select().from(series).where(eq(series.id, seriesId));
  if (!s) throw new StudioError("작품을 찾을 수 없어요");
  const format = (s.format ?? "webtoon") as SeriesFormat;
  if (!stagesFor(format).includes(stage)) {
    throw new StudioError(`${format === "novel" ? "웹소설" : "웹툰"}에는 '${STAGE_INFO[stage].label}' 단계가 없어요`);
  }

  const latest = await latestArtifacts(seriesId, episodeId);
  if (!canStart(stage, asLatest(latest))) {
    const missing = UPSTREAM[stage].filter((u) => !["approved", "edited"].includes(latest[u]?.status ?? ""));
    throw new StudioError(
      latest[stage]?.status === "generating"
        ? "이미 생성 중이에요"
        : `먼저 승인해야 할 단계: ${missing.map((m) => STAGE_INFO[m].label).join(", ")}`,
    );
  }

  if (episodeId) {
    const budget = s.brief.episodeBudgetUsd ?? DEFAULT_EPISODE_BUDGET;
    const spent = await episodeCost(episodeId);
    if (budget > 0 && spent >= budget) {
      throw new StudioError(
        `이 회차 제작비가 상한에 닿았어요 (${usd(spent)} / ${usd(budget)}). 회차 화면 위쪽에서 상한을 올리면 계속할 수 있어요.`,
      );
    }
  }

  const inputIds = UPSTREAM[stage].map((u) => latest[u]!.id);
  const versions = [];
  for (const agent of [STAGE_INFO[stage].agent, ...extraGuidelineAgents(stage, format)]) {
    versions.push(...(await resolveGuidelineVersions(agent, s.genre, seriesId, episodeId)));
  }
  const attempt = (latest[stage]?.attempt ?? 0) + 1;

  const [artifact] = await db
    .insert(artifacts)
    .values({
      seriesId,
      episodeId,
      stage,
      attempt,
      status: "generating",
      inputArtifactIds: inputIds,
      inputHash: inputHash(inputIds),
      guidelineVersionIds: versions.map((v) => v.v.id),
      ownerNote: opts.instruction ?? "",
    })
    .returning({ id: artifacts.id });

  await enqueueJob({
    type: stage,
    seriesId,
    episodeId,
    artifactId: artifact.id,
    payload: {
      instruction: opts.instruction ?? "",
      ...(opts.panels?.length ? { panels: opts.panels, base_artifact_id: opts.baseArtifactId } : {}),
      ...(opts.extra ?? {}),
    },
  });

  if (attempt > 1) {
    await db.insert(decisionLedger).values({
      artifactId: artifact.id,
      seriesId,
      actor,
      action: "regenerate",
      note: opts.panels?.length ? `${opts.panels.join(", ")}컷 다시 그리기. ${opts.instruction ?? ""}`.trim() : (opts.instruction ?? ""),
    });
  }
  return artifact.id;
}

/** 앞 단계가 바뀌면 뒤 단계 결과물을 "낡음"으로 표시해요 (03번 4절). 공개된 회차는 건드리지 않아요. */
async function seriesFormat(seriesId: string): Promise<SeriesFormat> {
  const [s] = await db.select({ format: series.format }).from(series).where(eq(series.id, seriesId));
  return (s?.format ?? "webtoon") as SeriesFormat;
}

async function markDownstreamStale(a: Artifact, format: SeriesFormat) {
  const stages = allDownstream(a.stage as Stage, format);
  if (stages.length === 0) return;
  const scope = isSeriesStage(a.stage as Stage)
    ? eq(artifacts.seriesId, a.seriesId)
    : and(eq(artifacts.seriesId, a.seriesId), eq(artifacts.episodeId, a.episodeId!));
  await db
    .update(artifacts)
    .set({ status: "stale", updatedAt: new Date() })
    .where(
      and(
        scope,
        inArray(artifacts.stage, stages),
        inArray(artifacts.status, ["pending_review", "approved", "edited"]),
        sql`(${artifacts.episodeId} is null or ${artifacts.episodeId} not in (select id from episodes where status = 'published'))`,
      ),
    );
}

async function getArtifact(id: string): Promise<Artifact> {
  const [a] = await db.select().from(artifacts).where(eq(artifacts.id, id));
  if (!a) throw new StudioError("결과물을 찾을 수 없어요");
  return a;
}

async function afterApproved(a: Artifact, actor: string) {
  const format = await seriesFormat(a.seriesId);
  await markDownstreamStale(a, format);
  const latest = await latestArtifacts(a.seriesId, a.episodeId);
  for (const next of nextToEnqueue(a.stage as Stage, asLatest(latest), format)) {
    await startStage({ seriesId: a.seriesId, episodeId: a.episodeId, stage: next, actor });
  }
  // 인물까지 승인되면 연재 설정(제목, 소개, 뿌리 노트)의 빈 칸을 AI가 기본값으로 채워요
  if (a.stage === "characters" && !a.episodeId) await autoFillSeriesMeta(a.seriesId);
}

async function autoFillSeriesMeta(seriesId: string) {
  const [s] = await db.select().from(series).where(eq(series.id, seriesId));
  if (!s) return;
  const missing = s.title === "제목 미정" || !s.title || !s.titleEn || !s.logline || !s.rootNote;
  if (!missing) return;
  const { jobs } = schema;
  const busy = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.type, "series_meta"), eq(jobs.seriesId, seriesId), inArray(jobs.status, ["queued", "running"])));
  if (!busy.length) await enqueueJob({ type: "series_meta", seriesId });
}

export async function approveArtifact(id: string, actor: string, note = "") {
  const a = await getArtifact(id);
  if (!canApprove({ id: a.id, stage: a.stage as Stage, status: a.status })) {
    throw new StudioError("검토 대기 중인 결과물만 승인할 수 있어요");
  }
  // 관문: ④+는 부품을 잠그고 그 부품으로 인물 시트를 그린 결과만 승인할 수 있어요
  if (a.stage === "sheets" && (a.body as { phase?: string }).phase === "parts") {
    throw new StudioError("부품을 골라 잠그고 '잠근 부품으로 인물 시트 그리기'를 마친 뒤에 승인할 수 있어요");
  }
  const blockers = a.stage === "sheets" ? sheetBlockers(a.body) : [];
  if (blockers.length) {
    throw new StudioError(
      `주인공 ${blockers.join(", ")}의 시트에 치명 결함이 남아 있어요. 이대로 승인하면 ⑦ 작화가 모든 컷에서 같은 실수를 따라 그려요. ` +
        "틀린 부품은 '잠근 부품 바꾸기'로 다시 고르고, 그 인물만 다시 그려 주세요",
    );
  }
  const pending = (a.body as { kind?: string; pending?: number[] }).pending;
  if (a.stage === "art" && pending?.length) {
    throw new StudioError(`아직 그리지 않은 컷이 ${pending.length}개 있어요. '나머지 그리기'를 먼저 눌러 주세요`);
  }
  await db.update(artifacts).set({ status: "approved", updatedAt: new Date() }).where(eq(artifacts.id, id));
  await db.insert(decisionLedger).values({ artifactId: id, seriesId: a.seriesId, actor, action: "approve", note });
  await afterApproved({ ...a, status: "approved" }, actor);
}

export async function rejectArtifact(id: string, actor: string, note: string) {
  const a = await getArtifact(id);
  if (a.status === "generating") throw new StudioError("생성 중인 결과물은 반려할 수 없어요");
  await db.update(artifacts).set({ status: "rejected", updatedAt: new Date() }).where(eq(artifacts.id, id));
  await db.insert(decisionLedger).values({ artifactId: id, seriesId: a.seriesId, actor, action: "reject", note });
}

/** 대표가 결과물을 직접 고쳐요. 고친 결과는 승인으로 취급하고 전후 내용을 원장에 남겨요. */
export async function editArtifact(id: string, actor: string, body: Record<string, unknown>, note = "") {
  const a = await getArtifact(id);
  if (a.status === "generating") throw new StudioError("생성이 끝난 뒤에 고칠 수 있어요");
  await db
    .update(artifacts)
    .set({ status: "edited", body, updatedAt: new Date() })
    .where(eq(artifacts.id, id));
  await db.insert(decisionLedger).values({
    artifactId: id,
    seriesId: a.seriesId,
    actor,
    action: "edit",
    before: a.body,
    after: body,
    note,
  });
  await afterApproved({ ...a, status: "edited", body }, actor);
}
