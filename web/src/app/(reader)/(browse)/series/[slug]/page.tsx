import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Cover } from "@/components/reader/cover";
import { IconChevron } from "@/components/reader/icons";
import { DAY_LABEL, DICT, genreLabel, getLocale, ROOT_CATEGORY } from "@/lib/i18n";
import { getSeries } from "@/lib/reader";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = await getSeries((await params).slug, await getLocale());
  return s ? { title: s.title, description: s.logline } : {};
}

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = DICT[locale];
  const s = await getSeries(slug, locale);
  if (!s) notFound();
  const latest = s.episodes[s.episodes.length - 1];
  const dateFmt = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { timeZone: "Asia/Seoul", month: "short", day: "numeric" });
  const days = s.days.map((d) => DAY_LABEL[locale][d]).join(locale === "ko" ? "·" : ", ");

  return (
    <>
      <section className="px-4 pt-5">
        <div className="grid grid-cols-[120px_1fr] gap-4 sm:grid-cols-[180px_1fr]">
          <Cover src={s.cover} title={s.title} eager />
          <div className="min-w-0">
            <h1 className="font-serif text-[22px] font-semibold leading-tight sm:text-[26px]">{s.title}</h1>
            {s.altTitle ? <p className="mt-1 text-[13px] text-ink-faint">{s.altTitle}</p> : null}
            <p className="mt-2 text-[12px] text-ink-soft">
              {genreLabel(s.genre, locale)} · {t.episodeCount(s.episodes.length)}
              {days ? ` · ${t.updates(days)}` : ""}
            </p>
            {s.roots.length ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {s.roots.map((r) => (
                  <Link
                    key={r.name}
                    href={`/explore?root=${r.category}`}
                    className="inline-flex h-7 items-center rounded-full border border-line px-2.5 text-[12px] text-ink-soft"
                  >
                    {locale === "ko" ? r.name : ROOT_CATEGORY.en[r.category]}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {s.logline ? <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">{s.logline}</p> : null}
        <div className="mt-4 flex gap-2">
          <Link href={`/series/${s.slug}/1`} className="flex h-12 flex-1 items-center justify-center rounded-[5px] bg-ink text-[15px] font-semibold text-paper">
            {t.first}
          </Link>
          {latest.number > 1 ? (
            <Link
              href={`/series/${s.slug}/${latest.number}`}
              className="flex h-12 items-center justify-center rounded-[5px] border border-line bg-paper-raised px-4 text-[14px]"
            >
              {t.latest} {t.episodes(latest.number)}
            </Link>
          ) : null}
        </div>
      </section>

      {s.rootNote ? (
        <section className="px-4 pt-6">
          <div className="rounded-[6px] bg-paper-sunk px-5 py-4">
            <p className="text-[11px] tracking-[0.14em] text-ink-faint">{t.rootNote}</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{s.rootNote}</p>
          </div>
        </section>
      ) : null}

      <section className="pt-6" aria-labelledby="eps">
        <h2 id="eps" className="px-4 text-[14px] font-semibold">
          {t.list}
        </h2>
        <ol className="mt-2 divide-y divide-line border-y border-line">
          {[...s.episodes].reverse().map((e) => (
            <li key={e.number}>
              <Link href={`/series/${s.slug}/${e.number}`} className="flex min-h-[60px] items-center gap-3 px-4 py-2 hover:bg-paper-sunk">
                <span className="w-14 flex-none font-serif text-[15px] font-semibold tabular-nums">{t.episodes(e.number)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]">{e.title || t.epNo(e.number)}</span>
                  {e.publishAt ? <span className="text-[12px] text-ink-faint">{dateFmt.format(e.publishAt)}</span> : null}
                </span>
                <span className="text-[11px] font-semibold text-ink-soft">{t.free}</span>
                <span className="text-ink-faint">
                  <IconChevron />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
