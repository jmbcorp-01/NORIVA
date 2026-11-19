import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Button, Card, Empty, formatDate, PageHeader } from "@/components/ui";
import { JOB_STATUS } from "@/lib/labels";
import { STAGE_INFO, type Stage } from "@/lib/pipeline";
import { artifactHref } from "@/lib/links";
import { retryJob } from "../../actions";

const TONE = { queued: "neutral", running: "indigo", done: "pine", failed: "plum", canceled: "neutral" } as const;

export default async function JobsPage() {
  const rows = await db
    .select({ j: schema.jobs, title: schema.series.title, episodeNumber: schema.episodes.number })
    .from(schema.jobs)
    .innerJoin(schema.series, eq(schema.series.id, schema.jobs.seriesId))
    .leftJoin(schema.episodes, eq(schema.episodes.id, schema.jobs.episodeId))
    .orderBy(desc(schema.jobs.createdAt))
    .limit(100);

  return (
    <>
      <PageHeader
        title="작업 큐"
        sub="에이전트에게 맡긴 작업이에요. 제작 서버가 순서대로 꺼내 실행하고, 실패하면 다시 시도할 수 있어요."
      />
      {rows.length === 0 ? (
        <Empty>아직 작업이 없어요.</Empty>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map(({ j, title, episodeNumber }) => (
              <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <Link href={artifactHref({ seriesId: j.seriesId, episodeNumber })} className="text-[14px] font-medium hover:text-indigo">
                  {title}
                  {episodeNumber ? ` ${episodeNumber}화` : ""}
                </Link>
                <span className="text-[13px] text-ink-soft">
                  {STAGE_INFO[j.type as Stage].no} {STAGE_INFO[j.type as Stage].label}
                </span>
                <Badge tone={TONE[j.status]}>{JOB_STATUS[j.status]}</Badge>
                {j.attempts > 1 ? <span className="text-[11px] text-ink-faint">{j.attempts}회 시도</span> : null}
                <span className="ml-auto text-[12px] text-ink-faint">{formatDate(j.createdAt)}</span>
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
