import { ErrorNotice } from "@/components/error-notice";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Notice, PageHeader } from "@/components/ui";
import { SourceForm } from "../source-form";

export default async function SourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; filling?: string }>;
}) {
  const { id } = await params;
  const { error, saved, filling } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [source] = await db.select().from(schema.sources).where(eq(schema.sources.id, id));
  if (!source) notFound();
  const used = await db
    .select({ id: schema.series.id, title: schema.series.title })
    .from(schema.seriesSources)
    .innerJoin(schema.series, eq(schema.series.id, schema.seriesSources.seriesId))
    .where(eq(schema.seriesSources.sourceId, id));
  const [fillJob] = await db
    .select({ status: schema.jobs.status, error: schema.jobs.error, updatedAt: schema.jobs.updatedAt })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.type, "source_fill"), sql`${schema.jobs.payload}->>'source_id' = ${id}`))
    .orderBy(desc(schema.jobs.createdAt))
    .limit(1);
  const fillBusy = fillJob && (fillJob.status === "queued" || fillJob.status === "running");

  return (
    <>
      <PageHeader
        title={source.name}
        sub={
          used.length ? (
            <>
              사용한 작품:{" "}
              {used.map((u, i) => (
                <span key={u.id}>
                  {i ? ", " : ""}
                  <Link className="text-indigo underline-offset-4 hover:underline" href={`/studio/series/${u.id}`}>
                    {u.title}
                  </Link>
                </span>
              ))}
            </>
          ) : (
            "아직 이 소재를 쓴 작품이 없어요."
          )
        }
      />
      <ErrorNotice>{error}</ErrorNotice>
      {saved ? <Notice tone="pine">저장했어요.</Notice> : null}
      {fillBusy ? (
        <Notice tone="indigo">
          AI가 원전과 고증 자료를 조사하고 있어요. 1~3분 뒤 새로고침하면 빈 칸이 채워져 있어요. 대표가 쓴 칸은 그대로 둬요.
        </Notice>
      ) : filling && fillJob?.status === "done" ? (
        <Notice tone="pine">AI가 빈 칸을 채웠어요. 원전과 고증 메모를 한 번 확인해 주세요.</Notice>
      ) : fillJob?.status === "failed" ? (
        <Notice>AI 채우기에 실패했어요: {fillJob.error}</Notice>
      ) : null}
      <SourceForm source={source} />
    </>
  );
}
