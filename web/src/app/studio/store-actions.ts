"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireOwner } from "@/lib/auth";
import { protectSeriesPanels } from "@/lib/panel-media";

const Product = z.object({
  coins: z.coerce.number().int().min(1).max(100000),
  bonusCoins: z.coerce.number().int().min(0).max(100000),
  priceKrw: z.coerce.number().int().min(100).max(10_000_000),
  appleProductId: z.string().trim().max(100).regex(/^[\w.]*$/),
  googleProductId: z.string().trim().max(100).regex(/^[a-z0-9_.]*$/),
  badge: z.string().trim().max(12),
  sort: z.coerce.number().int().min(0).max(999),
  active: z.boolean(),
});

function read(fd: FormData) {
  return Product.parse({
    coins: fd.get("coins"),
    bonusCoins: fd.get("bonusCoins") || 0,
    priceKrw: fd.get("priceKrw"),
    appleProductId: String(fd.get("appleProductId") ?? ""),
    googleProductId: String(fd.get("googleProductId") ?? ""),
    badge: String(fd.get("badge") ?? ""),
    sort: fd.get("sort") || 0,
    active: fd.get("active") === "on",
  });
}

function done(msg?: string): never {
  revalidatePath("/studio/store");
  revalidatePath("/coins");
  redirect(msg ? `/studio/store?error=${encodeURIComponent(msg)}` : "/studio/store?saved=1");
}

/** 코인 상품 추가 */
export async function createProduct(fd: FormData) {
  await requireOwner();
  let p;
  try {
    p = read(fd);
  } catch {
    done("입력값을 확인해 주세요 (스토어 상품 ID는 영문·숫자·점·밑줄만)");
  }
  await db.insert(schema.coinProducts).values(p);
  done();
}

/** 코인 상품 수정 */
export async function updateProduct(fd: FormData) {
  await requireOwner();
  const id = z.string().uuid().parse(fd.get("id"));
  let p;
  try {
    p = read(fd);
  } catch {
    done("입력값을 확인해 주세요 (스토어 상품 ID는 영문·숫자·점·밑줄만)");
  }
  await db.update(schema.coinProducts).set({ ...p, updatedAt: new Date() }).where(eq(schema.coinProducts.id, id));
  done();
}

/** 코인 상품 삭제. 이미 결제된 기록이 있으면 지우지 않고 판매만 멈춰요 (결제 기록 보관 의무). */
export async function deleteProduct(fd: FormData) {
  await requireOwner();
  const id = z.string().uuid().parse(fd.get("id"));
  const [used] = await db.select({ id: schema.payments.id }).from(schema.payments).where(eq(schema.payments.productId, id)).limit(1);
  if (used) {
    await db.update(schema.coinProducts).set({ active: false, updatedAt: new Date() }).where(eq(schema.coinProducts.id, id));
    done("결제 기록이 있는 상품이라 지우지 않고 판매를 멈췄어요");
  }
  await db.delete(schema.coinProducts).where(eq(schema.coinProducts.id, id));
  done();
}

/** 작품 판매 설정: 유료 여부, 처음 몇 화 무료, 기다무 */
export async function updateSeriesSale(fd: FormData) {
  await requireOwner();
  const id = z.string().uuid().parse(fd.get("id"));
  const v = z
    .object({ paid: z.boolean(), freeEpisodes: z.coerce.number().int().min(0).max(999), waitFree: z.boolean(), priceCoins: z.coerce.number().int().min(0).max(100) })
    .parse({ paid: fd.get("paid") === "on", freeEpisodes: fd.get("freeEpisodes"), waitFree: fd.get("waitFree") === "on", priceCoins: fd.get("priceCoins") });
  await db.transaction(async (tx) => {
    await tx.update(schema.series).set({ paid: v.paid, freeEpisodes: v.freeEpisodes, waitFree: v.waitFree, updatedAt: new Date() }).where(eq(schema.series.id, id));
    await tx.update(schema.episodes).set({ priceCoins: v.priceCoins }).where(eq(schema.episodes.seriesId, id));
  });
  if (v.paid) await protectSeriesPanels(id);
  done();
}
