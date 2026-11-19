import Link from "next/link";
import { Cover } from "@/components/reader/cover";
import { SeriesGrid } from "@/components/reader/series-grid";
import { DAY_KEYS, DAY_LABEL, DICT, genreLabel, getLocale, ROOT_CATEGORY, todayKey } from "@/lib/i18n";
import { listSeries } from "@/lib/reader";
import { Logo } from "@/components/logo";
import { ContinueRow } from "@/components/reader/continue-row";
import { continueReading } from "@/lib/library";
import { currentReader } from "@/lib/reader-auth";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const locale = await getLocale();
  const t = DICT[locale];
  const all = await listSeries(locale);
  const { day: dayParam } = await searchParams;

  if (all.length === 0) {
    return (
      <section className="flex min-h-[70dvh] flex-col items-center justify-center px-4 text-center">
        <Logo size={44} />
        <p className="mt-10 font-serif text-[19px] leading-relaxed text-ink">{t.tagline}</p>
        <p className="mt-6 text-[13px] text-ink-faint">{t.noSeries}</p>
      </section>
    );
  }

  const hero = all[0];
  const day = dayParam === "done" || DAY_KEYS.includes(dayParam as (typeof DAY_KEYS)[number]) ? dayParam! : todayKey();
  const byDay = all.filter((s) => (day === "done" ? s.status === "completed" : s.days.includes(day)));
  const categories = [...new Set(all.flatMap((s) => s.roots.map((r) => r.category)))];
  const withNote = all.find((s) => s.rootNote) ?? null;
  const reader = await currentReader();
  const resume = reader ? await continueReading(reader.id, locale, 8) : [];

  return (
    <>
      <section className="px-4 pt-4">
        <Link href={`/series/${hero.slug}`} className="block overflow-hidden rounded-[6px] bg-[#1f2a31] text-[#f6f2ea]">
          <div className="grid sm:grid-cols-[minmax(0,260px)_1fr]">
            <Cover src={hero.cover} title={hero.title} eager className="!aspect-auto h-[300px] rounded-none sm:!aspect-[3/4] sm:h-auto" />
            <div className="flex flex-col justify-end px-4 pb-5 pt-4 sm:px-6">
              <p className="text-[12px] tracking-wide text-[#b9b0a0]">
                {t.newThisWeek} · {genreLabel(hero.genre, locale)}
              </p>
              <h1 className="mt-1.5 font-serif text-[26px] font-semibold leading-tight">{hero.title}</h1>
              {hero.logline ? <p className="mt-2.5 text-[14px] leading-relaxed text-[#e4dccb]">{hero.logline}</p> : null}
            </div>
          </div>
        </Link>
        <Link
          href={`/series/${hero.slug}/1`}
          className="mt-2.5 flex h-12 items-center justify-center rounded-[5px] bg-ink text-[15px] font-semibold text-paper"
        >
          {t.readFirst}
        </Link>
      </section>

      {resume.length ? (
        <section className="pt-8" aria-labelledby="resume">
          <div className="flex items-baseline px-4">
            <h2 id="resume" className="font-serif text-[18px] font-semibold">
              {t.continueReading}
            </h2>
            <Link href="/library" className="ml-auto py-2 text-[13px] text-ink-faint">
              {t.library}
            </Link>
          </div>
          <ContinueRow items={resume} t={t} />
        </section>
      ) : null}

      <section className="pt-8" aria-labelledby="by-day">
        <h2 id="by-day" className="px-4 font-serif text-[18px] font-semibold">
          {t.byDay}
        </h2>
        <nav aria-label={t.byDay} className="mt-2 flex overflow-x-auto border-b border-line px-2">
          {[...DAY_KEYS, "done" as const].map((d) => (
            <Link
              key={d}
              href={`/?day=${d}`}
              scroll={false}
              aria-current={day === d ? "page" : undefined}
              className={`grid h-11 min-w-[44px] flex-1 place-items-center px-1 text-[14px] ${
                day === d ? "font-semibold text-ink shadow-[inset_0_-2px_0_var(--ink)]" : "text-ink-faint"
              }`}
            >
              {d === "done" ? t.done : DAY_LABEL[locale][d]}
            </Link>
          ))}
        </nav>
        <div className="px-4 pt-4">
          {byDay.length ? <SeriesGrid items={byDay} locale={locale} freeLabel={t.free} /> : <p className="py-6 text-[13px] text-ink-faint">{t.noMatch}</p>}
        </div>
      </section>

      {categories.length ? (
        <section className="px-4 pt-9" aria-labelledby="by-root">
          <h2 id="by-root" className="font-serif text-[18px] font-semibold">
            {t.byRoot}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((c) => (
              <Link
                key={c}
                href={`/explore?root=${c}`}
                className="inline-flex h-9 items-center rounded-full border border-line bg-paper-raised px-3.5 text-[13px] hover:border-line-strong"
              >
                {ROOT_CATEGORY[locale][c]}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {withNote ? (
        <section className="px-4 pt-8">
          <div className="rounded-[6px] bg-paper-sunk px-5 py-5">
            <p className="text-[11px] tracking-[0.14em] text-ink-faint">{t.rootNote}</p>
            <h3 className="mt-2 font-serif text-[16px] font-semibold">{withNote.title}</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{withNote.rootNote}</p>
          </div>
        </section>
      ) : null}

      <p className="px-4 pt-6 text-[12px] text-ink-faint">{t.freeBeta}</p>
    </>
  );
}
