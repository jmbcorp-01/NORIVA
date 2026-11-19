import Link from "next/link";
import type { Metadata } from "next";
import { SeriesGrid } from "@/components/reader/series-grid";
import { DICT, genreLabel, getLocale, ROOT_CATEGORY } from "@/lib/i18n";
import { listSeries } from "@/lib/reader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Explore" };

export default async function Explore({ searchParams }: { searchParams: Promise<{ genre?: string; root?: string }> }) {
  const locale = await getLocale();
  const t = DICT[locale];
  const { genre, root } = await searchParams;
  const all = await listSeries(locale);
  const genres = [...new Set(all.map((s) => s.genre))];
  const roots = [...new Set(all.flatMap((s) => s.roots.map((r) => r.category)))];
  const items = all.filter((s) => (!genre || s.genre === genre) && (!root || s.roots.some((r) => r.category === root)));

  const href = (g?: string, r?: string) => {
    const q = new URLSearchParams();
    if (g) q.set("genre", g);
    if (r) q.set("root", r);
    const s = q.toString();
    return s ? `/explore?${s}` : "/explore";
  };

  return (
    <div className="px-4 pt-5">
      <h1 className="font-serif text-[22px] font-semibold">{t.explore}</h1>
      <Filter label={t.genre}>
        <Chip href={href(undefined, root)} active={!genre}>
          {t.all}
        </Chip>
        {genres.map((g) => (
          <Chip key={g} href={href(g, root)} active={genre === g}>
            {genreLabel(g, locale)}
          </Chip>
        ))}
      </Filter>
      <Filter label={t.roots}>
        <Chip href={href(genre, undefined)} active={!root}>
          {t.all}
        </Chip>
        {roots.map((r) => (
          <Chip key={r} href={href(genre, r)} active={root === r}>
            {ROOT_CATEGORY[locale][r]}
          </Chip>
        ))}
      </Filter>
      <div className="pt-6">
        {items.length ? <SeriesGrid items={items} locale={locale} freeLabel={t.free} /> : <p className="py-8 text-[13px] text-ink-faint">{t.noMatch}</p>}
      </div>
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-[12px] text-ink-faint">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] ${
        active ? "border-ink bg-ink text-paper" : "border-line bg-paper-raised text-ink hover:border-line-strong"
      }`}
    >
      {children}
    </Link>
  );
}
