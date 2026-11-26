import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { mediaUrl } from "@/lib/media";
import { Badge, Button, Card, Input, Notice, PageHeader } from "@/components/ui";
import { deleteSamplesAction, fillSamplesAction } from "@/app/studio/sample-actions";
import { SAMPLES } from "@/lib/samples";

export const dynamic = "force-dynamic";

/** IR용 샘플 작품 채우기·지우기. 실제 작품은 건드리지 않아요. */
export default async function Samples({ searchParams }: { searchParams: Promise<{ added?: string; deleted?: string; error?: string }> }) {
  const sp = await searchParams;
  const rows = await db
    .select({ slug: schema.series.slug, title: schema.series.title, genre: schema.series.genre, cover: schema.series.coverUrl })
    .from(schema.series)
    .where(eq(schema.series.isDummy, true))
    .orderBy(asc(schema.series.title));
  const listed = new Set(SAMPLES.map((s) => s.slug));
  const have = new Set(rows.map((r) => r.slug));
  const missing = SAMPLES.filter((s) => !have.has(s.slug)).length;
  const stale = rows.filter((r) => !listed.has(r.slug)).length;
  return (
    <>
      <PageHeader
        title="샘플 작품"
        sub={`투자 설명(IR)용으로 독자 화면을 채우는 샘플이에요. 작품 ${SAMPLES.length}개에 표지 1장과 회차 1개(그림 1장)씩 들어가고, 화면에 '샘플' 표시가 붙어요. 이미 있는 그림을 써서 비용이 들지 않아요.`}
      />
      {sp.added ? <Notice tone="pine">샘플 {sp.added}개를 넣었어요.</Notice> : null}
      {sp.deleted ? <Notice tone="pine">샘플 {sp.deleted}개를 지웠어요.</Notice> : null}
      {sp.error === "confirm" ? <Notice>전체 삭제하려면 칸에 &apos;삭제&apos;라고 적어 주세요.</Notice> : null}

      <div className="flex flex-wrap gap-4">
        <Card className="min-w-[260px] flex-1 p-5">
          <h2 className="text-[15px] font-semibold">샘플 채우기</h2>
          <p className="mt-1 text-[13px] text-ink-soft">지금 {rows.length}개 있어요. 없는 것만 넣어요.</p>
          {stale ? (
            <p className="mt-1 text-[13px] text-plum">
              그림이 작품 소개와 맞지 않아 목록에서 뺀 예전 샘플이 {stale}개 있어요. 모두 삭제한 뒤 다시 채우면 정리돼요.
            </p>
          ) : null}
          <form action={fillSamplesAction} className="mt-4">
            <Button variant="primary" disabled={missing === 0}>
              {missing ? `샘플 ${missing}개 넣기` : "모두 들어 있어요"}
            </Button>
          </form>
        </Card>
        <Card className="min-w-[260px] flex-1 p-5">
          <h2 className="text-[15px] font-semibold">샘플 모두 삭제</h2>
          <p className="mt-1 text-[13px] text-ink-soft">샘플 표시가 있는 작품 {rows.length}개만 지워요. 실제 작품은 남아요.</p>
          <form action={deleteSamplesAction} className="mt-4 flex gap-2">
            <Input name="confirm" placeholder="삭제" autoComplete="off" className="w-[110px]" />
            <Button variant="danger" disabled={rows.length === 0}>
              모두 삭제
            </Button>
          </form>
        </Card>
      </div>

      {rows.length ? (
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {rows.map((r) => (
            <li key={r.slug}>
              <Card className="overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(r.cover)} alt="" className="aspect-[3/4] w-full object-cover" />
                <div className="p-2.5">
                  <Link href={`/series/${r.slug}`} className="block truncate text-[13px] font-semibold hover:underline">
                    {r.title}
                  </Link>
                  <div className="mt-1 flex items-center justify-between">
                    <Badge tone="plum">샘플</Badge>
                    <form action={deleteSamplesAction}>
                      <input type="hidden" name="slug" value={r.slug} />
                      <button className="text-[12px] text-plum hover:underline">삭제</button>
                    </form>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
