import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PublishedPanel } from "@/db/schema";
import { mediaUrl } from "./media";
import { getPrivate, getPublicMedia, putPrivate } from "./private-media";

/**
 * 유료 회차 그림 보호.
 * - 유료 작품의 공개본 그림은 비공개 저장소(private/paid/)로 옮기고, 공개본에는 'private:키'로 적어요.
 * - 뷰어는 서버에서 볼 수 있는지 확인한 뒤에만, 10분 동안만 쓸 수 있는 서명 주소(/api/panel)를 줘요.
 * 그래서 그림 주소를 다른 사람에게 넘겨도 금방 막혀요.
 */

const PRIVATE = "private:";
const TTL_SEC = 600;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is missing");
  return s;
}

function sign(key: string, exp: number) {
  return createHmac("sha256", secret()).update(`panel:${key}:${exp}`).digest("base64url");
}

/** 뷰어에 넣을 그림 주소 */
export function panelSrc(image: string, now = Date.now()): string {
  if (!image.startsWith(PRIVATE)) return mediaUrl(image);
  const key = image.slice(PRIVATE.length);
  const exp = Math.floor(now / 1000) + TTL_SEC;
  return `/api/panel?k=${encodeURIComponent(key)}&e=${exp}&s=${sign(key, exp)}`;
}

export function verifyPanel(key: string, exp: number, sig: string, now = Date.now()): boolean {
  if (!key.startsWith("paid/") || key.includes("..") || !Number.isFinite(exp) || exp * 1000 < now) return false;
  const a = Buffer.from(sign(key, exp));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function readPanel(key: string) {
  return getPrivate(key);
}

/** 작품의 공개된 회차 그림을 모두 비공개 저장소로 옮겨요 (유료로 바꿀 때, 유료 작품 회차를 공개할 때). 이미 옮긴 그림은 건너뛰어요. */
export async function protectSeriesPanels(seriesId: string) {
  const rows = await db
    .select({ id: schema.episodeAssets.id, panels: schema.episodeAssets.panels })
    .from(schema.episodeAssets)
    .innerJoin(schema.episodes, eq(schema.episodes.id, schema.episodeAssets.episodeId))
    .where(eq(schema.episodes.seriesId, seriesId));
  for (const r of rows) {
    let changed = false;
    const panels: PublishedPanel[] = [];
    for (const p of r.panels) {
      if (p.image.startsWith(PRIVATE) || p.image.startsWith("/") || /^https?:/.test(p.image)) {
        panels.push(p);
        continue;
      }
      const data = await getPublicMedia(p.image);
      if (!data) {
        panels.push(p);
        continue;
      }
      const key = `paid/${p.image}`;
      await putPrivate(key, data, p.image.endsWith(".png") ? "image/png" : "image/jpeg");
      panels.push({ ...p, image: `${PRIVATE}${key}` });
      changed = true;
    }
    if (changed) await db.update(schema.episodeAssets).set({ panels, updatedAt: new Date() }).where(eq(schema.episodeAssets.id, r.id));
  }
}
