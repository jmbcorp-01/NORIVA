import Link from "next/link";
import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Card, Empty, formatDate, LinkButton, PageHeader } from "@/components/ui";
import { JOB_LABEL, STAGE_INFO, type Stage } from "@/lib/pipeline";
import { artifactHref } from "@/lib/links";
import { AutoRefresh } from "@/components/auto-refresh";
import { JobProgressBar } from "@/components/job-progress";
import { jobLabel, runningJobRows, typicalSeconds } from "@/lib/progress";

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
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const [[sourceCount], [scoutDone], [candidatePending], approvedStages, [published], failedJobs, upcoming] = await Promise.all([
    db.select({ n: count() }).from(schema.sources),
    db.select({ n: count() }).from(schema.scoutRuns).where(eq(schema.scoutRuns.status, "done")),
    db.select({ n: count() }).from(schema.sourceCandidates).where(eq(schema.sourceCandidates.status, "pending")),
    db
      .selectDistinct({ stage: artifacts.stage })
      .from(artifacts)
      .where(inArray(artifacts.status, ["approved", "edited"])),
    db.select({ n: count() }).from(episodes).where(eq(episodes.status, "published")),
    db
      .select({ id: jobs.id, type: jobs.type, error: jobs.error, title: series.title, updatedAt: jobs.updatedAt })
      .from(jobs)
      .leftJoin(series, eq(series.id, jobs.seriesId))
      .where(eq(jobs.status, "failed"))
      .orderBy(desc(jobs.updatedAt))
      .limit(5),
    db
      .select({ seriesId: series.id, title: series.title, number: episodes.number, publishAt: episodes.publishAt })
      .from(episodes)
      .innerJoin(series, eq(series.id, episodes.seriesId))
      .where(and(eq(episodes.status, "scheduled"), gte(episodes.publishAt, now), lte(episodes.publishAt, weekEnd)))
      .orderBy(episodes.publishAt)
      .limit(10),
  ]);
  const running = await runningJobRows();
  const typical = await typicalSeconds(running.map((r) => r.job.type));
  const approved = new Set(approvedStages.map((a) => a.stage));
  const firstSteps = [
    { done: sourceCount.n > 0 || scoutDone.n > 0, label: "소재 찾기", hint: "소재 발굴로 시장 조사를 돌리거나 라이브러리에 소재를 넣어요", href: "/studio/scout" },
    { done: seriesCount.n > 0, label: "새 작품 기획", hint: "장르와 뿌리 소재를 고르면 기획안 3개가 나와요", href: "/studio/series/new" },
    { done: approved.has("concept"), label: "기획안 승인", hint: "기획안 하나를 골라 다듬고 승인해요", href: "/studio/series" },
    { done: approved.has("style"), label: "스토리·인물·화풍 승인", hint: "작품 단계 ②~④를 차례로 승인해요", href: "/studio/series" },
    { done: episodeCount.n > 0, label: "1화 추가", hint: "작품 화면에서 회차를 추가해요", href: "/studio/series" },
    { done: approved.has("review"), label: "1화 검수 승인", hint: "대본부터 검수까지 진행해요", href: "/studio/series" },
    { done: published.n > 0, label: "첫 공개", hint: "공개 일시를 예약해요", href: "/studio/series" },
  ];
  const stepsLeft = firstSteps.filter((s) => !s.done).length;
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
      <AutoRefresh active={running.length > 0} seconds={15} />
      {running.length ? (
        <section className="mb-9">
          <h2 className="mb-3 text-[14px] font-semibold">지금 도는 작업</h2>
          <Card>
            <ul className="divide-y divide-line">
              {running.map((r) => (
                <li key={r.job.id}>
                  <Link href={r.href} className="block px-4 py-3 hover:bg-paper-sunk">
                    <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-[14px]">
                      <span className="font-medium">{r.name}</span>
                      <span className="text-[13px] text-ink-soft">{jobLabel(r.job.type)}</span>
                    </div>
                    <JobProgressBar job={r.job} typical={typical[r.job.type]} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
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

      {stepsLeft > 0 ? (
        <details open={stepsLeft > 2} className="mb-9">
          <summary className="mb-3 cursor-pointer text-[14px] font-semibold">
            첫 작품까지 <span className="font-normal text-ink-faint">{firstSteps.length - stepsLeft}/{firstSteps.length} 완료 · </span>
            <Link href="/studio/guide" className="font-normal text-indigo hover:underline">
              사용 안내
            </Link>
          </summary>
          <Card>
            <ol className="divide-y divide-line">
              {firstSteps.map((st, i) => (
                <li key={st.label}>
                  <Link href={st.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-paper-sunk">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                        st.done ? "bg-pine text-paper" : "border border-line-strong text-ink-faint"
                      }`}
                    >
                      {st.done ? "✓" : i + 1}
                    </span>
                    <span className={`text-[14px] ${st.done ? "text-ink-faint line-through" : "font-medium"}`}>{st.label}</span>
                    {!st.done ? <span className="text-[12px] text-ink-faint">{st.hint}</span> : null}
                  </Link>
                </li>
              ))}
            </ol>
          </Card>
        </details>
      ) : null}

      <h2 className="mb-3 text-[14px] font-semibold">오늘 할 일</h2>
      <div className="mb-9 grid gap-3 md:grid-cols-3">
        <Card className="px-4 py-3">
          <div className="text-[12px] font-semibold text-ink-soft">승인하기</div>
          <p className="mt-1 text-[13px]">
            {waiting.length ? (
              <Link href="#pending" className="text-indigo hover:underline">
                검토 대기 {waiting.length}건
              </Link>
            ) : (
              <span className="text-ink-faint">승인할 결과가 없어요</span>
            )}
          </p>
          <p className="mt-1 text-[13px]">
            {candidatePending.n ? (
              <Link href="/studio/scout" className="text-indigo hover:underline">
                소재 후보 {candidatePending.n}개 검토
              </Link>
            ) : (
              <span className="text-ink-faint">검토할 소재 후보가 없어요</span>
            )}
          </p>
        </Card>
        <Card className="px-4 py-3">
          <div className="text-[12px] font-semibold text-ink-soft">실패한 작업</div>
          {failedJobs.length ? (
            <ul className="mt-1 space-y-1 text-[13px]">
              {failedJobs.map((j) => (
                <li key={j.id} className="truncate">
                  <Link href="/studio/jobs" className="hover:text-indigo" title={j.error ?? ""}>
                    {j.title ? `${j.title} · ` : ""}
                    {JOB_LABEL[j.type]}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[13px] text-ink-faint">없어요</p>
          )}
        </Card>
        <Card className="px-4 py-3">
          <div className="text-[12px] font-semibold text-ink-soft">이번 주 공개 예정</div>
          {upcoming.length ? (
            <ul className="mt-1 space-y-1 text-[13px]">
              {upcoming.map((u) => (
                <li key={`${u.seriesId}-${u.number}`}>
                  <Link href={`/studio/series/${u.seriesId}/episodes/${u.number}`} className="hover:text-indigo">
                    {u.title} {u.number}화
                  </Link>{" "}
                  <span className="text-ink-faint">{formatDate(u.publishAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[13px] text-ink-faint">예약된 회차가 없어요</p>
          )}
        </Card>
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
