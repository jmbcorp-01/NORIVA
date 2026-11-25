import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { STAGE_INFO, type Stage } from "./pipeline";

const { artifacts, decisionLedger, episodes, jobs, costLedger } = schema;

export type HistoryRow = {
  at: Date;
  /** ai: 에이전트가 만든 결과 · owner: 대표의 선택·수정·승인 */
  who: "ai" | "owner";
  actor: string;
  episode: number | null;
  stage: string;
  action: string;
  detail: string;
  models: string;
  costUsd: number;
};

const ACTION_LABEL: Record<string, string> = {
  approve: "승인",
  reject: "반려",
  edit: "직접 고침",
  regenerate: "다시 생성 요청",
  override: "기준 바꿈",
  publish: "공개",
  unpublish: "비공개",
  restore_guideline: "지침 되돌림",
  credit_default: "크레딧 기본값",
  credit_add: "크레딧 추가",
  credit_edit: "크레딧 수정",
  credit_delete: "크레딧 삭제",
  cover_upload: "표지 올림",
};
export const actionLabel = (a: string) => ACTION_LABEL[a] ?? a;
const stageLabel = (s: string | null) => (s && s in STAGE_INFO ? `${STAGE_INFO[s as Stage].no} ${STAGE_INFO[s as Stage].label}` : "");

/** 작품 제작 이력: AI가 만든 결과(단계, 모델, 비용)와 대표의 결정을 시간 순서로 (docs/07 4절) */
export async function seriesHistory(seriesId: string): Promise<HistoryRow[]> {
  const made = await db
    .select({
      at: artifacts.createdAt,
      stage: artifacts.stage,
      attempt: artifacts.attempt,
      status: artifacts.status,
      episode: episodes.number,
      models: sql<string>`coalesce(string_agg(distinct ${costLedger.model}, ', '), '')`,
      cost: sql<string>`coalesce(sum(${costLedger.costUsd}), 0)`,
    })
    .from(artifacts)
    .leftJoin(episodes, eq(episodes.id, artifacts.episodeId))
    .leftJoin(jobs, eq(jobs.artifactId, artifacts.id))
    .leftJoin(costLedger, eq(costLedger.jobId, jobs.id))
    .where(eq(artifacts.seriesId, seriesId))
    .groupBy(artifacts.id, episodes.number)
    .orderBy(asc(artifacts.createdAt));

  const decided = await db
    .select({
      at: decisionLedger.createdAt,
      actor: decisionLedger.actor,
      action: decisionLedger.action,
      note: decisionLedger.note,
      stage: artifacts.stage,
      episode: episodes.number,
    })
    .from(decisionLedger)
    .leftJoin(artifacts, eq(artifacts.id, decisionLedger.artifactId))
    .leftJoin(episodes, eq(episodes.id, artifacts.episodeId))
    .where(and(eq(decisionLedger.seriesId, seriesId)))
    .orderBy(asc(decisionLedger.createdAt));

  const rows: HistoryRow[] = [
    ...made.map((m) => ({
      at: m.at,
      who: "ai" as const,
      actor: "AI 에이전트",
      episode: m.episode,
      stage: stageLabel(m.stage),
      action: m.attempt > 1 ? `${m.attempt}번째 생성` : "생성",
      detail: m.status === "failed" ? "실패" : "",
      models: m.models,
      costUsd: Number(m.cost),
    })),
    ...decided.map((d) => ({
      at: d.at,
      who: "owner" as const,
      actor: d.actor,
      episode: d.episode,
      stage: stageLabel(d.stage),
      action: actionLabel(d.action),
      detail: d.note,
      models: "",
      costUsd: 0,
    })),
  ];
  return rows.sort((a, b) => a.at.getTime() - b.at.getTime());
}

const cell = (v: string | number | null) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 엑셀에서 바로 열리는 CSV (한글이 깨지지 않게 BOM을 붙여요) */
export function historyCsv(rows: HistoryRow[]): string {
  const head = ["시각(한국)", "누가", "회차", "단계", "한 일", "내용", "AI 모델", "비용(달러)"];
  const fmt = (d: Date) => d.toLocaleString("sv-SE", { timeZone: "Asia/Seoul" });
  const body = rows.map((r) =>
    [fmt(r.at), r.who === "ai" ? "AI" : r.actor, r.episode ?? "", r.stage, r.action, r.detail, r.models, r.costUsd ? r.costUsd.toFixed(4) : ""].map(cell).join(","),
  );
  return "﻿" + [head.join(","), ...body].join("\r\n") + "\r\n";
}
