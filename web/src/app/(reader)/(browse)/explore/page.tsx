import type { Metadata } from "next";
import { Chip, FormatTabs, LinkTabs, PageTitle, SeriesGrid } from "@/components/reader/parts";
import { SearchBox } from "@/components/reader/search-box";
import { DAY_KEYS, DAY_LABEL, DICT, genreLabel, getLocale, ROOT_CATEGORY, todayKey } from "@/lib/i18n";
import { listSeries, weeklyRanking } from "@/lib/reader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Explore" };

const TABS = ["day", "popular", "new", "done"] as const;
type Tab = (typeof TABS)[number];

export default async function Explore({ searchParams }: { searchParams: Promise<{ genre?: string; root?: string; tab?: string; day?: string; f?: string }> }) {
  const locale = await getLocale();
  const t = DICT[locale];
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "day";
  const day = DAY_KEYS.includes(sp.day as (typeof DAY_KEYS)[number]) ? sp.day! : todayKey();
  const format = sp.f === "novel" ? "novel" : "webtoon";
  const all = (await listSeries(locale)).filter((s) => s.format === format);
  const genres = [...new Set(all.map((s) => s.genre))];
  const roots = [...new Set(all.flatMap((s) => s.roots.map((r) => r.category)))];
  const filtered = all.filter((s) => (!sp.genre || s.genre === sp.genre) && (!sp.root || s.roots.some((r) => r.category === sp.root)));

  let items = filtered;
  if (tab === "day") items = filtered.filter((s) => s.days.includes(day));
  else if (tab === "popular") items = await weeklyRanking(filtered, filtered.length);
  else if (tab === "new") items = [...filtered].sort((a, b) => (b.latestAt?.getTime() ?? 0) - (a.latestAt?.getTime() ?? 0));
  else items = filtered.filter((s) => s.status === "completed");

  const href = (p: Partial<{ genre: string; root: string; tab: string; day: string; f: string }>) => {
    const q = new URLSearchParams();
    const v = { f: format === "novel" ? "novel" : undefined, genre: sp.genre, root: sp.root, tab: tab === "day" ? undefined : tab, day: sp.day, ...p };
    for (const [k, x] of Object.entries(v)) if (x) q.set(k, x);
    const s = q.toString();
    return s ? `/explore?${s}` : "/explore";
  };

  return (
    <div className="px-4 pt-5">
      <PageTitle>{t.explore}</PageTitle>
      <div className="mt-3">
        <FormatTabs base="/explore" current={format} t={t} keep={{ tab: tab === "day" ? undefined : tab, day: sp.day }} />
      </div>
      <div className="mt-3 lg:hidden">
        <SearchBox t={t} />
      </div>
      <div className="-mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        <Chip href={href({ genre: "" })} active={!sp.genre}>
          {t.all}
        </Chip>
        {genres.map((g) => (
          <Chip key={g} href={href({ genre: g })} active={sp.genre === g}>
            {genreLabel(g, locale)}
          </Chip>
        ))}
      </div>
      {roots.length ? (
        <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          {roots.map((r) => (
            <Chip key={r} href={href({ root: sp.root === r ? "" : r })} active={sp.root === r}>
              {ROOT_CATEGORY[locale][r]}
            </Chip>
          ))}
        </div>
      ) : null}
      <LinkTabs
        className="mt-4"
        items={[
          { href: href({ tab: "" }), label: t.tabByDay, active: tab === "day" },
          { href: href({ tab: "popular" }), label: t.tabPopular, active: tab === "popular" },
          { href: href({ tab: "new" }), label: t.tabNew, active: tab === "new" },
          { href: href({ tab: "done" }), label: t.tabDone, active: tab === "done" },
        ]}
      />
      {tab === "day" ? (
        <nav aria-label={t.tabByDay} className="mt-3 flex justify-between md:justify-start md:gap-2">
          {DAY_KEYS.map((d) => (
            <a
              key={d}
              href={href({ day: d })}
              aria-current={d === day ? "page" : undefined}
              className={`grid h-9 min-w-9 place-items-center rounded-full px-2 text-[13.5px] ${d === day ? "bg-ink font-bold text-paper" : "text-ink-faint hover:text-ink"}`}
            >
              {DAY_LABEL[locale][d]}
            </a>
          ))}
        </nav>
      ) : null}
      <div className="pt-5">{items.length ? <SeriesGrid items={items} locale={locale} t={t} /> : <p className="py-8 text-[13px] text-ink-faint">{t.noMatch}</p>}</div>
    </div>
  );
}
