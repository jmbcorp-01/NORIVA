import Link from "next/link";
import { count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Card, Empty, formatDate, LinkButton, PageHeader } from "@/components/ui";
import { STAGE_INFO, type Stage } from "@/lib/pipeline";
import { artifactHref } from "@/lib/links";

export default async function Dashboard() {
  const { series, episodes, artifacts, jobs, costLedger } = schema;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [[seriesCount], [episodeCount], pending, jobCounts, [cost]] = await Promise.all([
    db.select({ n: count() }).from(series),
    db.select({ n: count() }).from(episodes),
    db
      .select({
        id: artifacts.id,
        stage: artifacts.stage,
        status: artifacts.status,
        updatedAt: artifacts.updatedAt,
        seriesId: artifacts.seriesId,
        seriesTitle: series.title,
        episodeNumber: episodes.number,
      })
      .from(artifacts)
      .innerJoin(series, eq(series.id, artifacts.seriesId))
      .leftJoin(episodes, eq(episodes.id, artifacts.episodeId))
      .where(inArray(artifacts.status, ["pending_review", "stale"]))
      .orderBy(desc(artifacts.updatedAt))
      .limit(12),
    db.select({ status: jobs.status, n: count() }).from(jobs).groupBy(jobs.status),
    db
      .select({ usd: sql<string>`coalesce(sum(${costLedger.costUsd}), 0)` })
      .from(costLedger)
      .where(gte(costLedger.createdAt, monthStart)),
  ]);
  const jobsBy = Object.fromEntries(jobCounts.map((j) => [j.status, j.n]));
  const waiting = pending.filter((p) => p.status === "pending_review");

  const stats = [
    { label: "작품", value: seriesCount.n },
    { label: "회차", value: episodeCount.n },
    { label: "승인 대기", value: waiting.length, href: "#pending" },
    { label: "작업 중", value: (jobsBy.queued ?? 0) + (jobsBy.running ?? 0), href: "/studio/jobs" },
    { label: "실패한 작업", value: jobsBy.failed ?? 0, href: "/studio/jobs" },
    { label: "이번 달 제작비", value: `$${Number(cost.usd).toFixed(2)}` },
  ];

  return (
    <>
      <PageHeader
        title="대시보드"
        sub="오늘 승인할 것과 돌고 있는 작업이에요. 매출과 독자 지표는 독자 앱이 열리면 여기에 더해져요."
        actions={
          <LinkButton href="/studio/series/new" variant="seal">
            새 작품 기획
          </LinkButton>
        }
      />
      <div className="mb-9 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => {
          const inner = (
            <>
              <div className="text-[12px] text-ink-faint">{s.label}</div>
              <div className="mt-1 font-serif text-[22px] font-semibold tabular-nums">{s.value}</div>
            </>
          );
          return s.href ? (
            <Link
              key={s.label}
              href={s.href}
              className="rounded-[var(--radius-card)] border border-line bg-paper-raised px-4 py-3 hover:border-line-strong"
            >
              {inner}
            </Link>
          ) : (
            <Card key={s.label} className="px-4 py-3">
              {inner}
            </Card>
          );
        })}
      </div>

      <h2 id="pending" className="mb-3 text-[14px] font-semibold">
        승인을 기다리는 결과물
      </h2>
      {pending.length === 0 ? (
        <Empty>지금은 승인할 것이 없어요. 새 작품을 기획하거나 회차 제작을 시작해 보세요.</Empty>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {pending.map((p) => (
              <li key={p.id}>
                <Link
                  href={artifactHref(p)}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-paper-sunk"
                >
                  <span className="text-[14px] font-medium">{p.seriesTitle}</span>
                  {p.episodeNumber ? <span className="text-[13px] text-ink-soft">{p.episodeNumber}화</span> : null}
                  <span className="text-[13px] text-ink-soft">
                    {STAGE_INFO[p.stage as Stage].no} {STAGE_INFO[p.stage as Stage].label}
                  </span>
                  {p.status === "stale" ? <Badge tone="plum">낡음</Badge> : <Badge tone="ochre">검토 대기</Badge>}
                  <span className="ml-auto text-[12px] text-ink-faint">{formatDate(p.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
