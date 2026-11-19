import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Button, Card, Empty, Input, Label, Notice, PageHeader } from "@/components/ui";
import { latestArtifacts } from "@/lib/studio";
import { isApproved, SERIES_STAGES, type Stage } from "@/lib/pipeline";
import { AGE_RATING, SERIES_STATUS, SOURCE_CATEGORY } from "@/lib/labels";
import { createEpisode } from "../../../actions";
import { StageBoard } from "../stage-board";

const EP_STATUS: Record<string, string> = { draft: "제작 중", review: "검수", approved: "승인", scheduled: "예약", published: "공개" };

export default async function SeriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [s] = await db.select().from(schema.series).where(eq(schema.series.id, id));
  if (!s) notFound();
  const [latest, roots, episodes] = await Promise.all([
    latestArtifacts(id, null),
    db
      .select({ id: schema.sources.id, name: schema.sources.name, category: schema.sources.category })
      .from(schema.seriesSources)
      .innerJoin(schema.sources, eq(schema.sources.id, schema.seriesSources.sourceId))
      .where(eq(schema.seriesSources.seriesId, id)),
    db.select().from(schema.episodes).where(eq(schema.episodes.seriesId, id)).orderBy(asc(schema.episodes.number)),
  ]);
  const toL = (st: Stage) => (latest[st] ? { id: latest[st]!.id, stage: st, status: latest[st]!.status } : undefined);
  const readyForEpisodes = isApproved(toL("story")) && isApproved(toL("characters"));
  const back = `/studio/series/${id}`;

  return (
    <>
      <PageHeader
        title={s.title}
        sub={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {s.titleEn ? <span className="mr-1">{s.titleEn}</span> : null}
            <Badge>{s.genre}</Badge>
            <Badge>{AGE_RATING[s.brief.ageRating]}</Badge>
            <Badge tone="indigo">{SERIES_STATUS[s.status]}</Badge>
          </span>
        }
      />
      <Notice>{error}</Notice>

      <div className="mb-8 flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
        <span className="font-medium text-ink">뿌리</span>
        {roots.map((r) => (
          <Link key={r.id} href={`/studio/sources/${r.id}`} className="rounded-full border border-line-strong px-2.5 py-0.5 hover:bg-paper-sunk">
            {r.name} <span className="text-ink-faint">· {SOURCE_CATEGORY[r.category]}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        <section>
          <h2 className="mb-3 text-[14px] font-semibold">작품 단계</h2>
          <StageBoard stages={SERIES_STAGES} latest={latest} seriesId={id} episodeId={null} back={back} />
        </section>

        <section>
          <h2 className="mb-3 text-[14px] font-semibold">회차</h2>
          {episodes.length === 0 ? (
            <Empty>스토리와 인물이 승인되면 회차를 만들 수 있어요.</Empty>
          ) : (
            <Card className="mb-4">
              <ul className="divide-y divide-line">
                {episodes.map((e) => (
                  <li key={e.id}>
                    <Link href={`${back}/episodes/${e.number}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper-sunk">
                      <span className="w-9 font-serif text-[15px] font-semibold tabular-nums">{e.number}화</span>
                      <span className="truncate text-[13px]">{e.title || e.logline || "제목 미정"}</span>
                      <span className="ml-auto">
                        <Badge tone={e.status === "published" ? "pine" : "neutral"}>{EP_STATUS[e.status]}</Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {readyForEpisodes ? (
            <form action={createEpisode} className="mt-4 space-y-2">
              <input type="hidden" name="seriesId" value={id} />
              <label className="block">
                <Label hint="스토리의 회차 요약에서 가져와도 돼요">다음 회차 한 줄 요약</Label>
                <Input name="logline" />
              </label>
              <Button type="submit" variant="primary" className="w-full">
                {episodes.length + 1}화 만들기
              </Button>
            </form>
          ) : null}
        </section>
      </div>
    </>
  );
}
