import "server-only";
import { and, count, eq, isNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { wallet } from "./commerce";
import type { Reader } from "./reader-auth";

/** 바깥 틀(헤더)에 보이는 코인 잔액과 안 읽은 알림 수 */
export async function chromeData(reader: Reader | null) {
  if (!reader) return { coins: null, unread: 0 };
  const [w, [n]] = await Promise.all([
    wallet(reader.id),
    db
      .select({ n: count() })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.readerId, reader.id), isNull(schema.notifications.readAt), lte(schema.notifications.createdAt, new Date()))),
  ]);
  return { coins: w.total, unread: n.n };
}
