import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Cover } from "@/components/reader/cover";
import { IconChevron, IconClock } from "@/components/reader/icons";
import { LinkTabs, PageTitle, SeriesGrid } from "@/components/reader/parts";
import { formatCountdown } from "@/lib/access-rules";
import { ownedEpisodes, waitFreeStatus } from "@/lib/commerce";
import { DICT, getLocale } from "@/lib/i18n";
import { bookmarkedSeries, continueReading } from "@/lib/library";
import { isFresh, listSeries } from "@/lib/reader";
import { currentReader } from "@/lib/reader-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Library" };

const TABS = ["recent", "saved", "owned", "wait"] as const;
type Tab = (typeof TABS)[number];

export default async function Library({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const reader = await currentReader();
  if (!reader) redirect("/login?next=/library");
  const locale = await getLocale();
  const t = DICT[locale];
  const tabParam = (await searchParams).tab;
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "recent";
  const empty = (msg: string) => (
    <p className="px-4 py-8 text-[13.5px] text-ink-faint md:px-0">
      {msg}{" "}
      <Link href="/explore" className="text-indigo underline-offset-2 hover:underline">
        {t.explore}
      </Link>
    </p>
  );

  let body: React.ReactNode;
  if (tab === "recent") {
    const items = await continueReading(reader.id, locale, 30);
    body = items.length ? (
      <ul className="md:grid md:grid-cols-2 md:gap-x-6">
        {items.map((it) => {
          const ep = it.nextEpisode ?? it.lastEpisode;
          const fresh = isFresh(it.series.latestAt);
          return (
            <li key={it.series.id} className="border-b border-line">
              <Link href={`/series/${it.series.slug}/${ep}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper-sunk md:px-0">
                <Cover src={it.series.cover} title={it.series.title} className="w-[62px] flex-none" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{it.series.title}</span>
                  <span className="mt-0.5 block text-[12px] text-ink-faint">{t.readUpTo(it.lastEpisode)}</span>
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-paper-sunk">
                    <span className="block h-full bg-ochre" style={{ width: `${Math.min(100, (it.lastEpisode / Math.max(1, it.series.latestNumber)) * 100)}%` }} />
                  </span>
                  <span className={`mt-1.5 block text-[11.5px] ${fresh ? "font-bold text-seal" : "text-indigo"}`}>
                    {fresh ? t.newEpUp : it.nextEpisode ? t.continueEp(it.nextEpisode) : t.nextComing}
                  </span>
                </span>
                <span className="text-ink-faint">
                  <IconChevron />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    ) : (
      empty(t.emptyRecent)
    );
  } else if (tab === "saved") {
    const items = await bookmarkedSeries(reader.id, locale);
    body = items.length ? (
      <div className="px-4 pt-4 md:px-0">
        <SeriesGrid items={items} locale={locale} t={t} />
      </div>
    ) : (
      empty(t.emptyLibrary)
    );
  } else if (tab === "owned") {
    const rows = await ownedEpisodes(reader.id);
    const groups = new Map<string, typeof rows>();
    for (const r of rows) groups.set(r.slug, [...(groups.get(r.slug) ?? []), r]);
    body = rows.length ? (
      <ul>
        {[...groups.entries()].map(([slug, eps]) => (
          <li key={slug} className="border-b border-line">
            <Link href={`/series/${slug}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper-sunk md:px-0">
              <Cover src={eps[0].cover} title={eps[0].title} className="w-[52px] flex-none" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{locale === "en" ? eps[0].titleEn || eps[0].title : eps[0].title}</span>
                <span className="mt-0.5 block text-[12px] text-ink-faint">{eps.map((e) => t.episodes(e.number)).join(", ")}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      empty(t.emptyOwned)
    );
  } else {
    const [timers, all] = await Promise.all([waitFreeStatus(reader.id), listSeries(locale)]);
    const by = new Map(all.map((s) => [s.id, s]));
    const items = timers.filter((x) => by.has(x.seriesId));
    body = items.length ? (
      <ul className="md:grid md:grid-cols-2 md:gap-x-6">
        {items.map((x) => {
          const s = by.get(x.seriesId)!;
          const ready = x.nextAt <= new Date();
          return (
            <li key={s.id} className="border-b border-line">
              <Link href={`/series/${s.slug}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper-sunk md:px-0">
                <Cover src={s.cover} title={s.title} className="w-[52px] flex-none" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{s.title}</span>
                  <span className={`mt-1 flex items-center gap-1 text-[12px] ${ready ? "font-bold text-ochre" : "text-ink-faint"}`}>
                    <IconClock size={13} />
                    {ready ? t.waitCharged : t.waitNext(formatCountdown(x.nextAt))}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    ) : (
      empty(t.emptyWait)
    );
  }

  return (
    <div className="pt-5 md:px-4">
      <div className="px-4 md:px-0">
        <PageTitle>{t.library}</PageTitle>
      </div>
      <LinkTabs
        className="mx-4 mt-3 md:mx-0"
        items={TABS.map((k) => ({
          href: k === "recent" ? "/library" : `/library?tab=${k}`,
          label: { recent: t.tabRecent, saved: t.tabSaved, owned: t.tabOwned, wait: t.tabWait }[k],
          active: tab === k,
        }))}
      />
      {body}
    </div>
  );
}
