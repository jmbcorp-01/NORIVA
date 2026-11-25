import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * 소재 발굴 자동 실행(매주 월요일 오전 9시) 켜기/끄기. studio_settings의 'scout_auto'가 'on'일 때만 켜져요.
 * 기본은 꺼짐이에요: 값이 없으면 작업기가 주간 예약 메시지를 받아도 조사하지 않아요 (worker Store.scout_auto_enabled).
 */
const KEY = "scout_auto";

export async function scoutAutoEnabled(): Promise<boolean> {
  const [r] = await db.select({ v: schema.studioSettings.value }).from(schema.studioSettings).where(eq(schema.studioSettings.key, KEY));
  return r?.v === "on";
}

export async function setScoutAuto(on: boolean): Promise<void> {
  if (!on) {
    await db.delete(schema.studioSettings).where(eq(schema.studioSettings.key, KEY));
    return;
  }
  await db
    .insert(schema.studioSettings)
    .values({ key: KEY, value: "on" })
    .onConflictDoUpdate({ target: schema.studioSettings.key, set: { value: "on", updatedAt: new Date() } });
}
