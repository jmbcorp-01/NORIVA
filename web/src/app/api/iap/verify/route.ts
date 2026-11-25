import { NextResponse } from "next/server";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { creditPurchase } from "@/lib/commerce";
import { rateLimit } from "@/lib/rate-limit";
import { currentReader } from "@/lib/reader-auth";
import { consumeGoogle, StoreVerifyError, verifyApple, verifyGoogle } from "@/lib/store-verify";

const Body = z.discriminatedUnion("store", [
  z.object({ store: z.literal("app_store"), transactionId: z.string().min(1).max(40) }),
  z.object({ store: z.literal("play"), productId: z.string().min(1).max(100), purchaseToken: z.string().min(10).max(4096) }),
]);

/** 앱이 결제를 마친 뒤 부르는 주소. 스토어 서버에서 확인된 거래만 코인으로 바꿔요. */
export async function POST(req: Request) {
  const reader = await currentReader();
  if (!reader) return NextResponse.json({ error: "login" }, { status: 401 });
  if (!(await rateLimit(`iap:${reader.id}`, 20, 60))) return NextResponse.json({ error: "too_many" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const b = parsed.data;
  try {
    const v = b.store === "app_store" ? await verifyApple(b.transactionId) : await verifyGoogle(b.productId, b.purchaseToken);
    const col = b.store === "app_store" ? schema.coinProducts.appleProductId : schema.coinProducts.googleProductId;
    const [product] = await db.select({ id: schema.coinProducts.id }).from(schema.coinProducts).where(or(eq(col, v.productId)));
    if (!product) return NextResponse.json({ error: "unknown_product" }, { status: 400 });
    const r = await creditPurchase({ readerId: reader.id, productId: product.id, store: b.store, storeTransactionId: v.transactionId, raw: v.raw });
    if (b.store === "play") await consumeGoogle(b.productId, b.purchaseToken).catch(() => {});
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof StoreVerifyError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
