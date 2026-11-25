import "server-only";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * 고정 창 횟수 제한. key마다 windowSec 동안 limit번까지 허용해요.
 * 서버가 여러 대여도 같은 DB 행을 같이 세요. 허용되면 true.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const t = schema.rateLimits;
  const r = await db.execute<{ count: number }>(sql`
    insert into ${t} (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when ${t.windowStart} < now() - make_interval(secs => ${windowSec}) then 1 else ${t.count} + 1 end,
      window_start = case when ${t.windowStart} < now() - make_interval(secs => ${windowSec}) then now() else ${t.windowStart} end
    returning count
  `);
  return (r.rows[0]?.count ?? 1) <= limit;
}

/** 요청 보낸 곳 (CloudFront·ALB 뒤에서는 x-forwarded-for의 첫 값) */
export function clientIp(h: Headers): string {
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}
