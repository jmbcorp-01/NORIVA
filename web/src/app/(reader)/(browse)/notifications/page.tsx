import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { and, desc, eq, lte } from "drizzle-orm";
import { PageTitle } from "@/components/reader/parts";
import { markAllRead } from "@/app/reader-actions";
import { db, schema } from "@/db";
import { DICT, getLocale } from "@/lib/i18n";
import { currentReader } from "@/lib/reader-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notifications" };

export default async function Notifications() {
  const reader = await currentReader();
  if (!reader) redirect("/login?next=/notifications");
  const locale = await getLocale();
  const t = DICT[locale];
  const rows = await db.select().from(schema.notifications).where(and(eq(schema.notifications.readerId, reader.id), lte(schema.notifications.createdAt, new Date()))).orderBy(desc(schema.notifications.createdAt)).limit(50);
  const unread = rows.some((r) => !r.readAt);
  const fmt = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { timeZone: "Asia/Seoul", month: "short", day: "numeric" });
  const safe = (h: string) => (h.startsWith("/") && !h.startsWith("//") ? h : "/");
  return (
    <div className="mx-auto max-w-[640px] px-4 pt-5">
      <div className="flex items-baseline justify-between">
        <PageTitle>{t.notifications}</PageTitle>
        {unread ? (
          <form action={markAllRead}>
            <button type="submit" className="text-[13px] text-ink-faint hover:text-ink">
              ✓
            </button>
          </form>
        ) : null}
      </div>
      {rows.length ? (
        <ul className="mt-4 border-t border-line">
          {rows.map((n) => (
            <li key={n.id} className="border-b border-line">
              <Link href={safe(n.href)} className={`block py-3.5 hover:bg-paper-sunk ${n.readAt ? "opacity-60" : ""}`}>
                <span className="flex justify-between gap-3">
                  <span className="text-[14.5px] font-semibold">{n.title}</span>
                  <span className="text-[12px] text-ink-faint">{fmt.format(n.createdAt)}</span>
                </span>
                {n.body ? <span className="mt-0.5 block text-[13px] text-ink-soft">{n.body}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-10 text-center text-[13.5px] text-ink-faint">{t.noNotifications}</p>
      )}
      <p className="mt-4 text-[12px] text-ink-faint">{t.pushLater}</p>
    </div>
  );
}
