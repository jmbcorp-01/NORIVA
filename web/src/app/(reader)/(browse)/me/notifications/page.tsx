import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { btn, PageTitle } from "@/components/reader/parts";
import { saveNotifPrefs } from "@/app/reader-actions";
import { db, schema } from "@/db";
import { DICT, getLocale } from "@/lib/i18n";
import { currentReader } from "@/lib/reader-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notification settings" };

export default async function NotifSettings({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const reader = await currentReader();
  if (!reader) redirect("/login?next=/me/notifications");
  const locale = await getLocale();
  const t = DICT[locale];
  const [p] = await db.select().from(schema.notificationPrefs).where(eq(schema.notificationPrefs.readerId, reader.id));
  const v = { newEpisode: p?.newEpisode ?? true, waitFree: p?.waitFree ?? true, events: p?.events ?? false };
  const rows = [
    { name: "newEpisode", label: t.notifNew, sub: t.notifNewSub },
    { name: "waitFree", label: t.notifWait, sub: t.notifWaitSub },
    { name: "events", label: t.notifEvents, sub: t.notifEventsSub },
  ] as const;
  return (
    <div className="mx-auto max-w-[640px] px-4 pt-5">
      <PageTitle>{t.notifSettings}</PageTitle>
      {(await searchParams).saved ? <p className="mt-3 text-[13px] text-pine">✓</p> : null}
      <form action={saveNotifPrefs} className="mt-4">
        <ul className="border-t border-line">
          {rows.map((r) => (
            <li key={r.name} className="border-b border-line">
              <label className="flex items-center gap-3 py-4">
                <span className="flex-1">
                  <span className="block text-[15px] font-semibold">{r.label}</span>
                  <span className="block text-[12.5px] text-ink-faint">{r.sub}</span>
                </span>
                <input type="checkbox" name={r.name} defaultChecked={v[r.name]} className="h-5 w-5 accent-[var(--ink)]" />
              </label>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-ink-faint">{t.pushLater}</p>
        <button type="submit" className={`${btn.ink} mt-5 w-full`}>
          {t.save}
        </button>
      </form>
    </div>
  );
}
