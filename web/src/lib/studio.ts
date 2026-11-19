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

/** 단계를 시작(또는 다시 생성)해요. 결과물 자리를 만들고 작업을 큐에 넣어요. */
export async function startStage(opts: {
  seriesId: string;
  episodeId: string | null;
  stage: Stage;
  actor: string;
  instruction?: string;
}): Promise<string> {
  const { seriesId, stage, actor } = opts;
  const episodeId = isSeriesStage(stage) ? null : opts.episodeId;
  if (!isSeriesStage(stage) && !episodeId) throw new StudioError("회차 단계에는 회차가 필요해요");

  const [s] = await db.select().from(series).where(eq(series.id, seriesId));
  if (!s) throw new StudioError("작품을 찾을 수 없어요");

  const latest = await latestArtifacts(seriesId, episodeId);
  if (!canStart(stage, asLatest(latest))) {
    const missing = UPSTREAM[stage].filter((u) => !["approved", "edited"].includes(latest[u]?.status ?? ""));
    throw new StudioError(
      latest[stage]?.status === "generating"
        ? "이미 생성 중이에요"
        : `먼저 승인해야 할 단계: ${missing.map((m) => STAGE_INFO[m].label).join(", ")}`,
    );
  }

  const inputIds = UPSTREAM[stage].map((u) => latest[u]!.id);
  const versions = await resolveGuidelineVersions(STAGE_INFO[stage].agent, s.genre, seriesId, episodeId);
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
    payload: { instruction: opts.instruction ?? "" },
  });

  if (attempt > 1) {
    await db.insert(decisionLedger).values({
      artifactId: artifact.id,
      seriesId,
      actor,
      action: "regenerate",
      note: opts.instruction ?? "",
    });
  }
  return artifact.id;
}

/** 앞 단계가 바뀌면 뒤 단계 결과물을 "낡음"으로 표시해요 (03번 4절). 공개된 회차는 건드리지 않아요. */
async function markDownstreamStale(a: Artifact) {
  const stages = allDownstream(a.stage as Stage);
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
  await markDownstreamStale(a);
  const latest = await latestArtifacts(a.seriesId, a.episodeId);
  for (const next of nextToEnqueue(a.stage as Stage, asLatest(latest))) {
    await startStage({ seriesId: a.seriesId, episodeId: a.episodeId, stage: next, actor });
  }
}

export async function approveArtifact(id: string, actor: string, note = "") {
  const a = await getArtifact(id);
  if (!canApprove({ id: a.id, stage: a.stage as Stage, status: a.status })) {
    throw new StudioError("검토 대기 중인 결과물만 승인할 수 있어요");
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
