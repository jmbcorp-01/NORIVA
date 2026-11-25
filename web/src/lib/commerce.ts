import "server-only";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { episodeAccess, latestRegularNumber, splitSpend, WAIT_FREE_HOURS, type Access, type ReaderRights } from "./access-rules";

const { coinWallets, coinTransactions, coinProducts, episodeUnlocks, episodes, series, waitFreeTimers, subscriptions, payments } = schema;

/** 독자에게 보이는 회차 조건 (reader.ts와 같아요) */
const visible = sql`${episodes.status} in ('published','scheduled') and ${episodes.publishAt} <= now()`;

export class CommerceError extends Error {
  constructor(public code: "not_found" | "no_coins" | "wait" | "excluded" | "sample" | "not_paid" | "disabled") {
    super(code);
  }
}

export async function wallet(readerId: string) {
  const [w] = await db.select().from(coinWallets).where(eq(coinWallets.readerId, readerId));
  return { paid: w?.paid ?? 0, free: w?.free ?? 0, total: (w?.paid ?? 0) + (w?.free ?? 0) };
}

export async function passActive(readerId: string): Promise<boolean> {
  const [s] = await db
    .select({ x: sql`1` })
    .from(subscriptions)
    .where(and(eq(subscriptions.readerId, readerId), eq(subscriptions.status, "active"), gt(subscriptions.expiresAt, sql`now()`)));
  return Boolean(s);
}

export async function passInfo(readerId: string) {
  const [s] = await db.select().from(subscriptions).where(eq(subscriptions.readerId, readerId));
  return s && s.expiresAt > new Date() ? s : null;
}

export async function readerRights(readerId: string, seriesId: string): Promise<ReaderRights> {
  const [owned, [timer], pass] = await Promise.all([
    db
      .select({ number: episodes.number })
      .from(episodeUnlocks)
      .innerJoin(episodes, eq(episodes.id, episodeUnlocks.episodeId))
      .where(and(eq(episodeUnlocks.readerId, readerId), eq(episodes.seriesId, seriesId))),
    db.select({ nextAt: waitFreeTimers.nextAt }).from(waitFreeTimers).where(and(eq(waitFreeTimers.readerId, readerId), eq(waitFreeTimers.seriesId, seriesId))),
    passActive(readerId),
  ]);
  return { owned: new Set(owned.map((o) => o.number)), passActive: pass, waitFreeReadyAt: timer?.nextAt ?? null };
}

type SaleRow = { id: string; number: number; priceCoins: number; earlyAccess: boolean };
type SeriesRow = { id: string; paid: boolean; freeEpisodes: number; waitFree: boolean; isDummy: boolean; waitFreeExclude: number; earlyPrice: number };

/** 작품의 회차마다 볼 수 있는지 계산해요. 로그인하지 않았으면 rights 없이 계산해요. */
export function accessMap(s: SeriesRow, eps: SaleRow[], rights: ReaderRights | null): Map<number, Access> {
  const latest = latestRegularNumber(eps);
  return new Map(eps.map((e) => [e.number, episodeAccess(s, e, latest, rights)]));
}

async function loadSeriesForSale(slug: string) {
  const [s] = await db
    .select({
      id: series.id,
      paid: series.paid,
      freeEpisodes: series.freeEpisodes,
      waitFree: series.waitFree,
      isDummy: series.isDummy,
      waitFreeExclude: series.waitFreeExclude,
      earlyPrice: series.earlyPrice,
    })
    .from(series)
    .where(eq(series.slug, slug));
  if (!s) return null;
  const eps = await db
    .select({ id: episodes.id, number: episodes.number, priceCoins: episodes.priceCoins, earlyAccess: episodes.earlyAccess })
    .from(episodes)
    .where(and(eq(episodes.seriesId, s.id), visible))
    .orderBy(asc(episodes.number));
  return { s, eps };
}

/** 이 독자가 이 회차를 지금 볼 수 있는지 (뷰어가 그림을 보여주기 전에 서버에서 확인) */
export async function canRead(readerId: string | null, slug: string, number: number): Promise<{ ok: boolean; access: Access | null }> {
  const loaded = await loadSeriesForSale(slug);
  if (!loaded) return { ok: false, access: null };
  const rights = readerId ? await readerRights(readerId, loaded.s.id) : null;
  const access = accessMap(loaded.s, loaded.eps, rights).get(number) ?? null;
  return { ok: Boolean(access && access.kind !== "locked"), access };
}

/**
 * 회차 열기. 한 번의 DB 처리 안에서 권한 확인 → 코인 차감 → 장부 → 소장 기록을 해요.
 * 같은 회차를 두 번 눌러도 장부 키(unlock:회차)가 같아서 한 번만 차감돼요.
 */
export async function unlockEpisode(readerId: string, slug: string, number: number, method: "coin" | "wait_free") {
  const loaded = await loadSeriesForSale(slug);
  if (!loaded) throw new CommerceError("not_found");
  const { s, eps } = loaded;
  const ep = eps.find((e) => e.number === number);
  if (!ep) throw new CommerceError("not_found");
  if (s.isDummy) throw new CommerceError("sample");

  return db.transaction(async (tx) => {
    // 같은 독자의 동시 요청을 줄 세워요 (지갑 행을 잠금)
    await tx.insert(coinWallets).values({ readerId }).onConflictDoNothing();
    const [w] = await tx.execute<{ paid: number; free: number }>(sql`select paid, free from ${coinWallets} where reader_id = ${readerId} for update`).then((r) => r.rows);

    const rights = await readerRightsTx(tx, readerId, s.id);
    const access = accessMap(s, eps, rights).get(number)!;
    if (access.kind !== "locked") return { access, spent: 0 };

    if (method === "wait_free") {
      if (access.waitFree === "excluded" || access.waitFree === "off") throw new CommerceError("excluded");
      if (access.waitFree === "waiting") throw new CommerceError("wait");
      await tx.insert(episodeUnlocks).values({ readerId, episodeId: ep.id, method: "wait_free" }).onConflictDoNothing();
      const nextAt = new Date(Date.now() + WAIT_FREE_HOURS * 3600 * 1000);
      await tx
        .insert(waitFreeTimers)
        .values({ readerId, seriesId: s.id, nextAt })
        .onConflictDoUpdate({ target: [waitFreeTimers.readerId, waitFreeTimers.seriesId], set: { nextAt } });
      return { access: { kind: "owned" } as Access, spent: 0 };
    }

    const split = splitSpend(w, access.price);
    if (!split) throw new CommerceError("no_coins");
    const paid = w.paid - split.paid;
    const free = w.free - split.free;
    const inserted = await tx
      .insert(coinTransactions)
      .values({
        readerId,
        deltaPaid: -split.paid,
        deltaFree: -split.free,
        reason: "unlock",
        refId: ep.id,
        balanceAfter: paid + free,
        idempotencyKey: `unlock:${ep.id}`,
      })
      .onConflictDoNothing()
      .returning({ id: coinTransactions.id });
    if (inserted.length === 0) return { access: { kind: "owned" } as Access, spent: 0 }; // 이미 처리된 요청
    await tx.update(coinWallets).set({ paid, free, updatedAt: new Date() }).where(eq(coinWallets.readerId, readerId));
    await tx.insert(episodeUnlocks).values({ readerId, episodeId: ep.id, method: "coin", coinsSpent: access.price }).onConflictDoNothing();
    return { access: { kind: "owned" } as Access, spent: access.price };
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function readerRightsTx(tx: Tx, readerId: string, seriesId: string): Promise<ReaderRights> {
  const owned = await tx
    .select({ number: episodes.number })
    .from(episodeUnlocks)
    .innerJoin(episodes, eq(episodes.id, episodeUnlocks.episodeId))
    .where(and(eq(episodeUnlocks.readerId, readerId), eq(episodes.seriesId, seriesId)));
  const [timer] = await tx.select({ nextAt: waitFreeTimers.nextAt }).from(waitFreeTimers).where(and(eq(waitFreeTimers.readerId, readerId), eq(waitFreeTimers.seriesId, seriesId)));
  const [pass] = await tx
    .select({ x: sql`1` })
    .from(subscriptions)
    .where(and(eq(subscriptions.readerId, readerId), eq(subscriptions.status, "active"), gt(subscriptions.expiresAt, sql`now()`)));
  return { owned: new Set(owned.map((o) => o.number)), passActive: Boolean(pass), waitFreeReadyAt: timer?.nextAt ?? null };
}

/**
 * 결제가 확인된 뒤 코인을 넣어요. 같은 스토어 거래 번호는 한 번만 처리돼요.
 * 인앱결제(lib/store-verify.ts)와 시험 결제가 모두 이 함수를 써요.
 */
export async function creditPurchase(input: {
  readerId: string;
  productId: string;
  store: "test" | "app_store" | "play" | "web";
  storeTransactionId: string;
  raw?: Record<string, unknown>;
}) {
  const [p] = await db.select().from(coinProducts).where(eq(coinProducts.id, input.productId));
  if (!p) throw new CommerceError("not_found");
  return db.transaction(async (tx) => {
    const ins = await tx
      .insert(payments)
      .values({
        readerId: input.readerId,
        kind: "coin",
        productId: p.id,
        amountKrw: p.priceKrw,
        store: input.store,
        storeTransactionId: input.storeTransactionId,
        status: "paid",
        raw: input.raw ?? {},
      })
      .onConflictDoNothing()
      .returning({ id: payments.id });
    if (ins.length === 0) return { credited: 0, duplicate: true };
    await tx.insert(coinWallets).values({ readerId: input.readerId }).onConflictDoNothing();
    const [w] = await tx.execute<{ paid: number; free: number }>(sql`select paid, free from ${coinWallets} where reader_id = ${input.readerId} for update`).then((r) => r.rows);
    const paid = w.paid + p.coins;
    const free = w.free + p.bonusCoins;
    await tx.update(coinWallets).set({ paid, free, updatedAt: new Date() }).where(eq(coinWallets.readerId, input.readerId));
    await tx.insert(coinTransactions).values({
      readerId: input.readerId,
      deltaPaid: p.coins,
      deltaFree: p.bonusCoins,
      reason: "charge",
      refId: ins[0].id,
      balanceAfter: paid + free,
      idempotencyKey: `charge:${input.store}:${input.storeTransactionId}`,
    });
    return { credited: p.coins + p.bonusCoins, duplicate: false };
  });
}

/**
 * 환불: 스토어 환불 알림이 오면 그 결제로 넣은 코인을 거둬요. 이미 쓴 코인이면 잔액이 0 아래로 가지 않게 남은 만큼만 거둬요.
 * (애플 App Store Server Notifications, 구글 실시간 개발자 알림을 연결할 때 이 함수를 불러요)
 */
export async function refundPayment(store: string, storeTransactionId: string) {
  return db.transaction(async (tx) => {
    const [pay] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.store, store), eq(payments.storeTransactionId, storeTransactionId)));
    if (!pay || pay.status === "refunded" || !pay.readerId) return false;
    const [p] = await tx.select().from(coinProducts).where(eq(coinProducts.id, pay.productId));
    const [w] = await tx.execute<{ paid: number; free: number }>(sql`select paid, free from ${coinWallets} where reader_id = ${pay.readerId} for update`).then((r) => r.rows);
    const takePaid = Math.min(w?.paid ?? 0, p?.coins ?? 0);
    const takeFree = Math.min(w?.free ?? 0, p?.bonusCoins ?? 0);
    await tx.update(payments).set({ status: "refunded", updatedAt: new Date() }).where(eq(payments.id, pay.id));
    if (w) {
      await tx
        .update(coinWallets)
        .set({ paid: w.paid - takePaid, free: w.free - takeFree, updatedAt: new Date() })
        .where(eq(coinWallets.readerId, pay.readerId));
      await tx
        .insert(coinTransactions)
        .values({
          readerId: pay.readerId,
          deltaPaid: -takePaid,
          deltaFree: -takeFree,
          reason: "refund",
          refId: pay.id,
          balanceAfter: w.paid - takePaid + w.free - takeFree,
          idempotencyKey: `refund:${pay.id}`,
        })
        .onConflictDoNothing();
    }
    return true;
  });
}

/** 시험 결제는 운영 서버에서 꺼져 있어요. PAYMENTS_TEST_MODE=1일 때만 (스토어 결제 연결 전 흐름 확인용) */
export function testPaymentsEnabled() {
  return process.env.PAYMENTS_TEST_MODE === "1" || process.env.NODE_ENV !== "production";
}

/** 시험 패스: 30일 */
export async function startTestPass(readerId: string) {
  if (!testPaymentsEnabled()) throw new CommerceError("disabled");
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await db
    .insert(subscriptions)
    .values({ readerId, store: "test", status: "active", expiresAt })
    .onConflictDoUpdate({ target: subscriptions.readerId, set: { status: "active", store: "test", expiresAt, updatedAt: new Date() } });
}

export async function cancelPass(readerId: string) {
  await db.update(subscriptions).set({ status: "canceled", updatedAt: new Date() }).where(eq(subscriptions.readerId, readerId));
}

export async function activeProducts() {
  return db.select().from(coinProducts).where(eq(coinProducts.active, true)).orderBy(asc(coinProducts.sort), asc(coinProducts.priceKrw));
}

export async function coinHistory(readerId: string, limit = 100) {
  return db.select().from(coinTransactions).where(eq(coinTransactions.readerId, readerId)).orderBy(desc(coinTransactions.createdAt)).limit(limit);
}

/** 소장한 회차 (작품별) */
export async function ownedEpisodes(readerId: string) {
  return db
    .select({
      slug: series.slug,
      title: series.title,
      titleEn: series.titleEn,
      cover: series.coverUrl,
      number: episodes.number,
      epTitle: episodes.title,
      method: episodeUnlocks.method,
      at: episodeUnlocks.createdAt,
    })
    .from(episodeUnlocks)
    .innerJoin(episodes, eq(episodes.id, episodeUnlocks.episodeId))
    .innerJoin(series, eq(series.id, episodes.seriesId))
    .where(and(eq(episodeUnlocks.readerId, readerId), eq(episodeUnlocks.method, "coin")))
    .orderBy(asc(series.title), asc(episodes.number));
}

/** 기다무 타이머가 있는 작품들 (내 서재 '기다무' 탭) */
export async function waitFreeStatus(readerId: string) {
  return db
    .select({ seriesId: waitFreeTimers.seriesId, nextAt: waitFreeTimers.nextAt })
    .from(waitFreeTimers)
    .where(eq(waitFreeTimers.readerId, readerId));
}
