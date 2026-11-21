import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Button, Card, Input, Label, Notice, PageHeader } from "@/components/ui";
import { createProduct, deleteProduct, updateProduct, updateSeriesSale } from "@/app/studio/store-actions";
import { storeConfigured } from "@/lib/store-verify";
import { testPaymentsEnabled } from "@/lib/commerce";

export const dynamic = "force-dynamic";

/** 판매 관리: 코인 상품(스토어 상품 ID 포함)과 작품별 판매 설정 */
export default async function Store({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const sp = await searchParams;
  const { coinProducts, series, episodes } = schema;
  const [products, seriesRows] = await Promise.all([
    db.select().from(coinProducts).orderBy(asc(coinProducts.sort), asc(coinProducts.priceKrw)),
    db
      .select({
        id: series.id,
        title: series.title,
        paid: series.paid,
        freeEpisodes: series.freeEpisodes,
        waitFree: series.waitFree,
        isDummy: series.isDummy,
        price: sql<number>`coalesce(max(${episodes.priceCoins}), 3)::int`,
        count: sql<number>`count(${episodes.id})::int`,
      })
      .from(series)
      .leftJoin(episodes, eq(episodes.seriesId, series.id))
      .groupBy(series.id)
      .orderBy(asc(series.isDummy), asc(series.title)),
  ]);
  const apple = storeConfigured("app_store");
  const google = storeConfigured("play");

  return (
    <>
      <PageHeader title="판매 관리" sub="코인 상품과 작품별 판매 조건을 정해요. 독자 화면의 코인 충전과 회차 잠금에 바로 반영돼요." />
      <Notice>{sp.error}</Notice>
      {sp.saved ? <Notice tone="pine">저장했어요.</Notice> : null}

      <Card className="mb-6 p-5">
        <h2 className="text-[15px] font-semibold">결제 연결 상태</h2>
        <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
          <Badge tone={apple ? "pine" : "neutral"}>iOS App Store {apple ? "연결됨" : "설정 전"}</Badge>
          <Badge tone={google ? "pine" : "neutral"}>Android Google Play {google ? "연결됨" : "설정 전"}</Badge>
          <Badge tone={testPaymentsEnabled() ? "ochre" : "neutral"}>시험 결제 {testPaymentsEnabled() ? "켜짐" : "꺼짐"}</Badge>
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-faint">
          앱 출시 때 App Store Connect와 Play Console에 아래 &apos;스토어 상품 ID&apos;와 같은 ID로 소모성 상품을 만들고, 키를 AWS Secrets Manager에 넣으면 연결돼요
          (APPLE_IAP_ISSUER_ID, APPLE_IAP_KEY_ID, APPLE_IAP_PRIVATE_KEY, APPLE_BUNDLE_ID / GOOGLE_PLAY_PACKAGE, GOOGLE_PLAY_SERVICE_ACCOUNT).
          스토어 가격은 정해진 가격 단계에서 골라야 해서, 여기 원화 가격도 그 단계에 맞춰 주세요.
        </p>
      </Card>

      <h2 className="mb-3 text-[16px] font-semibold">코인 상품</h2>
      <div className="space-y-3">
        {products.map((p) => (
          <Card key={p.id} className="p-4">
            <form action={updateProduct} className="grid grid-cols-2 gap-3 md:grid-cols-[90px_90px_110px_1fr_1fr_100px_70px]">
              <input type="hidden" name="id" value={p.id} />
              <ProductFields p={p} />
              <div className="col-span-2 flex items-center gap-3 md:col-span-7">
                <label className="flex items-center gap-1.5 text-[13px]">
                  <input type="checkbox" name="active" defaultChecked={p.active} /> 판매 중
                </label>
                <Button variant="primary">저장</Button>
                <Button variant="danger" formAction={deleteProduct}>
                  삭제
                </Button>
              </div>
            </form>
          </Card>
        ))}
        <Card className="border-dashed p-4">
          <p className="mb-3 text-[13px] font-semibold">새 상품 추가</p>
          <form action={createProduct} className="grid grid-cols-2 gap-3 md:grid-cols-[90px_90px_110px_1fr_1fr_100px_70px]">
            <ProductFields />
            <div className="col-span-2 flex items-center gap-3 md:col-span-7">
              <label className="flex items-center gap-1.5 text-[13px]">
                <input type="checkbox" name="active" defaultChecked /> 판매 중
              </label>
              <Button variant="seal">추가</Button>
            </div>
          </form>
        </Card>
      </div>

      <h2 className="mb-3 mt-10 text-[16px] font-semibold">작품별 판매 설정</h2>
      <p className="mb-3 text-[12.5px] text-ink-faint">유료를 끄면 모든 회차가 무료예요 (오픈 베타). 선공개 회차는 5코인 이상이고 기다무로 열 수 없어요.</p>
      <div className="space-y-2">
        {seriesRows.map((s) => (
          <Card key={s.id} className="p-4">
            <form action={updateSeriesSale} className="flex flex-wrap items-end gap-4">
              <input type="hidden" name="id" value={s.id} />
              <div className="min-w-[180px] flex-1">
                <p className="text-[14px] font-semibold">
                  {s.title} {s.isDummy ? <Badge tone="plum">샘플</Badge> : null}
                </p>
                <p className="text-[12px] text-ink-faint">회차 {s.count}개</p>
              </div>
              <label className="flex items-center gap-1.5 text-[13px]">
                <input type="checkbox" name="paid" defaultChecked={s.paid} disabled={s.isDummy} /> 유료
              </label>
              <label className="w-[110px]">
                <Label>처음 무료 회차</Label>
                <Input type="number" name="freeEpisodes" min={0} defaultValue={s.freeEpisodes} />
              </label>
              <label className="w-[100px]">
                <Label>1화 코인</Label>
                <Input type="number" name="priceCoins" min={0} max={100} defaultValue={s.price} />
              </label>
              <label className="flex items-center gap-1.5 text-[13px]">
                <input type="checkbox" name="waitFree" defaultChecked={s.waitFree} /> 기다무
              </label>
              <Button variant="primary" disabled={s.isDummy}>
                저장
              </Button>
            </form>
          </Card>
        ))}
      </div>
    </>
  );
}

function ProductFields({ p }: { p?: typeof schema.coinProducts.$inferSelect }) {
  return (
    <>
      <label>
        <Label>코인</Label>
        <Input type="number" name="coins" min={1} required defaultValue={p?.coins} />
      </label>
      <label>
        <Label>보너스</Label>
        <Input type="number" name="bonusCoins" min={0} defaultValue={p?.bonusCoins ?? 0} />
      </label>
      <label>
        <Label>가격(원)</Label>
        <Input type="number" name="priceKrw" min={100} step={100} required defaultValue={p?.priceKrw} />
      </label>
      <label>
        <Label>iOS 상품 ID</Label>
        <Input name="appleProductId" placeholder="kr.noriva.coins.10" defaultValue={p?.appleProductId} />
      </label>
      <label>
        <Label>Android 상품 ID</Label>
        <Input name="googleProductId" placeholder="coins_10" defaultValue={p?.googleProductId} />
      </label>
      <label>
        <Label>배지</Label>
        <Input name="badge" maxLength={12} placeholder="많이 사요" defaultValue={p?.badge} />
      </label>
      <label>
        <Label>순서</Label>
        <Input type="number" name="sort" min={0} defaultValue={p?.sort ?? 0} />
      </label>
    </>
  );
}
