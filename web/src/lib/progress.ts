import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import type { JobProgress } from "@/db/schema";
import { JOB_LABEL, type JobType } from "./pipeline";
import { artifactHref } from "./links";

export type JobView = {
  id: string;
  type: JobType;
  status: "queued" | "running" | "done" | "failed" | "canceled";
  startedAt: Date | null;
  createdAt: Date;
  progress: JobProgress | null;
  artifactId: string | null;
  seriesId: string | null;
  episodeId: string | null;
};

/** 단계별로 최근 완료 작업 5개가 걸린 평균 시간(초). 예상 남은 시간에 써요. */
export async function typicalSeconds(types: JobType[]): Promise<Partial<Record<JobType, number>>> {
  const out: Partial<Record<JobType, number>> = {};
  const uniq = [...new Set(types)];
  await Promise.all(
    uniq.map(async (t) => {
      const rows = await db
        .select({ s: schema.jobs.startedAt, f: schema.jobs.finishedAt })
        .from(schema.jobs)
        .where(and(eq(schema.jobs.type, t), eq(schema.jobs.status, "done"), isNotNull(schema.jobs.startedAt), isNotNull(schema.jobs.finishedAt)))
        .orderBy(desc(schema.jobs.finishedAt))
        .limit(5);
      const secs = rows.map((r) => (r.f!.getTime() - r.s!.getTime()) / 1000).filter((x) => x > 0);
      if (secs.length) out[t] = secs.reduce((a, b) => a + b, 0) / secs.length;
    }),
  );
  return out;
}

export async function activeJobs(where?: { artifactIds?: string[] }): Promise<JobView[]> {
  const conds = [inArray(schema.jobs.status, ["queued", "running"])];
  if (where?.artifactIds) {
    if (!where.artifactIds.length) return [];
    conds.push(inArray(schema.jobs.artifactId, where.artifactIds));
  }
  const rows = await db
    .select()
    .from(schema.jobs)
    .where(and(...conds))
    .orderBy(desc(schema.jobs.createdAt))
    .limit(50);
  return rows as JobView[];
}

export type Estimate = { percent: number | null; remainingSec: number | null; label: string };

/** 진행률과 남은 시간을 계산해요. 컷처럼 셀 수 있으면 지금 속도로, 아니면 지난 평균 시간으로. */
export function estimate(job: JobView, typical: number | undefined, now = Date.now()): Estimate {
  const p = job.progress;
  if (job.status === "queued") return { percent: null, remainingSec: typical ?? null, label: "대기 중 (작업 서버가 꺼져 있었으면 켜지는 데 1~3분)" };
  const elapsed = job.startedAt ? Math.max(0, (now - job.startedAt.getTime()) / 1000) : 0;
  if (p?.total && p.done !== undefined) {
    const percent = Math.round((p.done / p.total) * 100);
    // 처음 1컷이 끝나기 전에는 지난 평균 시간을 써요
    const remaining = p.done > 0 ? (elapsed / p.done) * (p.total - p.done) : typical ? Math.max(0, typical - elapsed) : null;
    return { percent, remainingSec: remaining, label: `${p.step} ${p.done}/${p.total}` };
  }
  if (typical) {
    const percent = Math.min(95, Math.round((elapsed / typical) * 100));
    return { percent, remainingSec: Math.max(0, typical - elapsed), label: p?.step ?? "시작하는 중" };
  }
  return { percent: null, remainingSec: null, label: p?.step ?? "시작하는 중" };
}

export function formatRemaining(sec: number | null): string {
  if (sec === null) return "";
  if (sec < 60) return "곧 끝나요";
  const m = Math.round(sec / 60);
  return m < 60 ? `약 ${m}분 남음` : `약 ${Math.floor(m / 60)}시간 ${m % 60}분 남음`;
}

export function jobLabel(type: JobType): string {
  return JOB_LABEL[type] ?? type;
}

export function jobHref(j: { seriesId: string | null; type: string; payload?: unknown }, episodeNumber: number | null) {
  if (j.seriesId) return artifactHref({ seriesId: j.seriesId, episodeNumber });
  if (j.type === "scout") return "/studio/scout";
  const sid = (j.payload as { source_id?: string } | null)?.source_id;
  return sid ? `/studio/sources/${sid}` : "/studio/sources";
}

export type JobRow = { job: JobView; name: string; href: string };

/** 작업에 작품 제목·회차·링크를 붙여 돌려줘요. 대시보드와 완료 알림에 써요. */
export async function jobRows(where: SQL, limit = 20): Promise<JobRow[]> {
  const rows = await db
    .select({ j: schema.jobs, title: schema.series.title, episodeNumber: schema.episodes.number })
    .from(schema.jobs)
    .leftJoin(schema.series, eq(schema.series.id, schema.jobs.seriesId))
    .leftJoin(schema.episodes, eq(schema.episodes.id, schema.jobs.episodeId))
    .where(where)
    .orderBy(desc(schema.jobs.updatedAt))
    .limit(limit);
  return rows.map(({ j, title, episodeNumber }) => ({
    job: j as JobView,
    name: j.seriesId ? `${title ?? ""}${episodeNumber ? ` ${episodeNumber}화` : ""}` : j.type === "scout" ? "소재 발굴" : "소재 라이브러리",
    href: jobHref(j, episodeNumber),
  }));
}

export const runningJobRows = () => jobRows(inArray(schema.jobs.status, ["queued", "running"]));
export const recentlyFinishedRows = (since: Date) =>
  jobRows(and(inArray(schema.jobs.status, ["done", "failed"]), gte(schema.jobs.finishedAt, since))!);
