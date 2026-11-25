import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Button, Card, Empty, formatDate, PageHeader } from "@/components/ui";
import { JOB_STATUS } from "@/lib/labels";
import { JOB_LABEL } from "@/lib/pipeline";
import { AutoRefresh } from "@/components/auto-refresh";
import { JobProgressBar } from "@/components/job-progress";
import { jobHref, typicalSeconds, type JobView } from "@/lib/progress";
import { retryJob } from "../../actions";

const TONE = { queued: "neutral", running: "indigo", done: "pine", failed: "plum", canceled: "neutral" } as const;

export default async function JobsPage() {
  const rows = await db
    .select({ j: schema.jobs, title: schema.series.title, episodeNumber: schema.episodes.number })
    .from(schema.jobs)
    .leftJoin(schema.series, eq(schema.series.id, schema.jobs.seriesId))
    .leftJoin(schema.episodes, eq(schema.episodes.id, schema.jobs.episodeId))
    .orderBy(desc(schema.jobs.createdAt))
    .limit(100);
  const active = rows.filter(({ j }) => j.status === "queued" || j.status === "running");
  const typical = await typicalSeconds(active.map(({ j }) => j.type));

  return (
    <>
      <PageHeader
        title="작업 큐"
        sub="에이전트에게 맡긴 작업이에요. 제작 서버가 순서대로 꺼내 실행하고, 실패하면 다시 시도할 수 있어요."
      />
      <AutoRefresh active={active.length > 0} />
      {rows.length === 0 ? (
        <Empty>아직 작업이 없어요.</Empty>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map(({ j, title, episodeNumber }) => (
              <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <Link href={jobHref(j, episodeNumber)} className="text-[14px] font-medium hover:text-indigo">
                  {j.seriesId ? `${title ?? ""}${episodeNumber ? ` ${episodeNumber}화` : ""}` : j.type === "scout" ? "소재 발굴함" : "소재 라이브러리"}
                </Link>
                <span className="text-[13px] text-ink-soft">{JOB_LABEL[j.type]}</span>
                <Badge tone={TONE[j.status]}>{JOB_STATUS[j.status]}</Badge>
                {j.attempts > 1 ? <span className="text-[11px] text-ink-faint">{j.attempts}회 시도</span> : null}
                <span className="ml-auto text-[12px] text-ink-faint">{formatDate(j.createdAt)}</span>
                {j.status === "queued" || j.status === "running" ? (
                  <div className="w-full max-w-[560px]">
                    <JobProgressBar job={j as JobView} typical={typical[j.type]} />
                  </div>
                ) : null}
                {j.status === "failed" ? (
                  <div className="flex w-full flex-wrap items-center gap-2">
                    <p className="flex-1 truncate text-[12px] text-plum">{j.error}</p>
                    <form action={retryJob}>
                      <input type="hidden" name="jobId" value={j.id} />
                      <Button type="submit">다시 시도</Button>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
