import type { Metadata } from "next";
import { PageTitle, SeriesGrid } from "@/components/reader/parts";
import { SearchBox } from "@/components/reader/search-box";
import { DICT, getLocale } from "@/lib/i18n";
import { listSeries, searchSeries } from "@/lib/reader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Search" };

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const locale = await getLocale();
  const t = DICT[locale];
  const q = String((await searchParams).q ?? "").slice(0, 60);
  const items = q ? searchSeries(await listSeries(locale), q) : [];
  return (
    <div className="px-4 pt-5">
      <PageTitle>{t.search}</PageTitle>
      <div className="mt-3">
        <SearchBox t={t} q={q} />
      </div>
      {q ? <p className="mt-5 text-[13px] text-ink-faint">{items.length ? t.searchResults(q, items.length) : t.searchNone(q)}</p> : null}
      {items.length ? (
        <div className="pt-4">
          <SeriesGrid items={items} locale={locale} t={t} />
        </div>
      ) : null}
    </div>
  );
}
