import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Notice, PageHeader } from "@/components/ui";
import { SourceForm } from "../source-form";

export default async function SourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [source] = await db.select().from(schema.sources).where(eq(schema.sources.id, id));
  if (!source) notFound();
  const used = await db
    .select({ id: schema.series.id, title: schema.series.title })
    .from(schema.seriesSources)
    .innerJoin(schema.series, eq(schema.series.id, schema.seriesSources.seriesId))
    .where(eq(schema.seriesSources.sourceId, id));

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
      <Notice>{error}</Notice>
      {saved ? <Notice tone="pine">저장했어요.</Notice> : null}
      <SourceForm source={source} />
    </>
  );
}
