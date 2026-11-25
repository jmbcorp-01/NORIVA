import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { AGE_RATING, SERIES_STATUS } from "@/lib/labels";

export default async function SeriesListPage() {
  const rows = await db
    .select({ s: schema.series, episodes: count(schema.episodes.id) })
    .from(schema.series)
    .leftJoin(schema.episodes, eq(schema.episodes.seriesId, schema.series.id))
    .groupBy(schema.series.id)
    .orderBy(desc(schema.series.updatedAt));

  return (
    <>
      <PageHeader
        title="작품 제작"
        sub="장르·소재 → 스토리 → 인물 → 화풍까지는 작품 단위로, 그 뒤는 회차마다 진행해요."
        actions={
          <LinkButton href="/studio/series/new" variant="seal">
            새 작품 기획
          </LinkButton>
        }
      />
      {rows.length === 0 ? (
        <Empty>아직 작품이 없어요. 소재를 골라 첫 기획안을 만들어 보세요.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ s, episodes }) => (
            <Link key={s.id} href={`/studio/series/${s.id}`} className="group">
              <Card className="flex h-full flex-col overflow-hidden transition-colors group-hover:border-line-strong">
                {/* 작품이 주인공이에요: 표지가 있으면 크게, 없으면 한지 면에 제목만 */}
                <div className="hanji flex aspect-[3/4] items-end bg-paper-sunk p-4">
                  {s.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.coverUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-serif text-[20px] leading-snug font-semibold text-ink-soft">{s.title}</span>
                  )}
                </div>
                <div className="px-4 py-3">
                  <div className="font-serif text-[15px] font-semibold">{s.title}</div>
                  {s.titleEn ? <div className="text-[12px] text-ink-faint">{s.titleEn}</div> : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge>{s.genre}</Badge>
                    <Badge>{AGE_RATING[s.brief.ageRating]}</Badge>
                    <Badge tone="indigo">{SERIES_STATUS[s.status]}</Badge>
                    <Badge>{episodes}화</Badge>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
