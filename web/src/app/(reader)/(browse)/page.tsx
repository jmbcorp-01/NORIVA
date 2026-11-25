import Link from "next/link";
import { Cover } from "@/components/reader/cover";
import { ContinueRow } from "@/components/reader/continue-row";
import { Badge, Chip, FormatTabs, SectionHead, Shelf, btn, seriesBadge } from "@/components/reader/parts";
import { Logo } from "@/components/logo";
import { DAY_LABEL, DICT, genreLabel, getLocale, ROOT_CATEGORY, todayKey } from "@/lib/i18n";
import { continueReading } from "@/lib/library";
import { isFresh, listSeries, weeklyRanking } from "@/lib/reader";
import { currentReader } from "@/lib/reader-auth";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const locale = await getLocale();
  const t = DICT[locale];
  const format = (await searchParams).f === "novel" ? "novel" : "webtoon";
  const everything = await listSeries(locale);

  if (everything.length === 0) {
    return (
      <section className="flex min-h-[70dvh] flex-col items-center justify-center px-4 text-center">
        <Logo size={44} />
        <p className="mt-10 font-serif text-[19px] leading-relaxed text-ink">{t.tagline}</p>
        <p className="mt-6 text-[13px] text-ink-faint">{t.noSeries}</p>
      </section>
    );
  }

  // 웹툰 | 웹소설: 고른 형식의 작품만 보여요. 이어 보기는 형식과 상관없이 다 보여요.
  const all = everything.filter((s) => s.format === format);
  if (all.length === 0) {
    return (
      <div className="px-4 pt-4">
        <FormatTabs base="/" current={format} t={t} />
        <p className="py-24 text-center text-[14px] text-ink-faint">{format === "novel" ? t.noNovelYet : t.noSeries}</p>
      </div>
    );
  }
  const reader = await currentReader();
  const [resume, ranking] = await Promise.all([reader ? continueReading(reader.id, locale, 8) : Promise.resolve([]), weeklyRanking(all, 5)]);
  // 대표 배너: 실제 작품을 먼저, 그다음 샘플
  const heroes = [...all].sort((a, b) => Number(a.isDummy) - Number(b.isDummy)).slice(0, 5);
  const today = todayKey();
  const fresh = all.filter((s) => isFresh(s.latestAt));
  const todayRow = fresh.length ? fresh : all.filter((s) => s.days.includes(today));
  const waitRow = all.filter((s) => s.paid && s.waitFree);
  const categories = [...new Set(all.flatMap((s) => s.roots.map((r) => r.category)))];

  return (
    <div className="px-4 md:px-4">
      <div className="pt-4">
        <FormatTabs base="/" current={format} t={t} />
      </div>
      <section aria-label={t.newThisWeek} className="pt-3">
        <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 md:mx-0 md:px-0">
          {heroes.map((h, i) => (
            <li key={h.id} className="w-full flex-none snap-center md:w-[calc(50%-6px)]">
              <Link href={`/series/${h.slug}`} className="relative block h-[320px] overflow-hidden rounded-[8px] bg-[#1f2a31] md:h-[360px]">
                <Cover src={h.cover} title={h.title} eager={i === 0} className="!absolute inset-0 !aspect-auto h-full w-full rounded-none" />
                <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_25%,rgba(18,22,26,.6)_55%,rgba(18,22,26,.95)_100%)]" />
                <span className="absolute inset-x-5 bottom-5 text-[#f4efe4]">
                  <span className="flex items-center gap-2 text-[12px] text-[#d9d0bf]">
                    {h.isDummy ? <Badge kind="sample" t={t} /> : null}
                    {genreLabel(h.genre, locale)}
                    {h.days.length ? ` · ${h.days.map((d) => DAY_LABEL[locale][d]).join("·")}` : ""}
                  </span>
                  <span className="mt-1.5 block font-serif text-[28px] font-semibold leading-tight">{h.title}</span>
                  {h.logline ? <span className="mt-2 line-clamp-2 block text-[13.5px] leading-relaxed text-[#e4dccb]">{h.logline}</span> : null}
                </span>
                <span className="absolute right-3 top-3 rounded-full bg-black/40 px-2 py-0.5 text-[11px] text-white">
                  {i + 1} / {heroes.length}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {resume.length ? (
        <section className="pt-8" aria-labelledby="resume">
          <SectionHead id="resume" title={t.continueReading} aside={t.seeAll} href="/library" />
          <ContinueRow items={resume} t={t} />
        </section>
      ) : null}

      {todayRow.length ? (
        <section className="pt-8" aria-labelledby="today">
          <SectionHead id="today" title={t.todayUpdates} aside={DAY_LABEL[locale][today]} href={`/explore?day=${today}${format === "novel" ? "&f=novel" : ""}`} />
          <Shelf items={todayRow} locale={locale} t={t} badge={(s) => (s.isDummy ? "sample" : "up")} />
        </section>
      ) : null}

      {waitRow.length ? (
        <section className="pt-8" aria-labelledby="wait">
          <SectionHead id="wait" title={t.waitFreeShelf} aside={t.waitFreeEvery} />
          <Shelf items={waitRow} locale={locale} t={t} badge={(s) => (s.isDummy ? "sample" : "wait")} />
        </section>
      ) : null}

      <div className="md:grid md:grid-cols-2 md:gap-10">
        <section className="pt-8" aria-labelledby="rank">
          <SectionHead id="rank" title={t.ranking} aside={t.seeAll} href={`/explore?tab=popular${format === "novel" ? "&f=novel" : ""}`} />
          <ol>
            {ranking.map((s, i) => {
              const b = seriesBadge(s);
              return (
                <li key={s.id}>
                  <Link href={`/series/${s.slug}`} className="flex items-center gap-3 border-b border-line py-2.5 hover:bg-paper-sunk">
                    <span className={`w-5 text-center font-serif text-[20px] font-bold ${i < 3 ? "text-seal" : "text-ink-faint"}`}>{i + 1}</span>
                    <Cover src={s.cover} title={s.title} className="w-[52px] flex-none" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[14.5px] font-semibold">
                        <span className="truncate">{s.title}</span>
                        {b === "sample" ? <Badge kind="sample" t={t} /> : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-ink-faint">
                        {genreLabel(s.genre, locale)}
                        {s.logline ? ` · ${s.logline}` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="pt-8">
          <div className="flex items-center gap-4 rounded-[8px] bg-[#1f2830] p-5 text-[#efe9dd]">
            <div className="flex-1">
              <p className="text-[12px] opacity-70">{t.pass}</p>
              <p className="mt-1 text-[16px] font-bold">{t.passPitch}</p>
              <p className="mt-1 text-[12.5px] opacity-75">
                {t.passPrice} · {t.passTrial}
              </p>
            </div>
            <Link href="/pass" className={`${btn.small} bg-[#efe9dd] text-[#211f1c]`}>
              {t.passLearn}
            </Link>
          </div>
          {categories.length ? (
            <section className="pt-8" aria-labelledby="by-root">
              <SectionHead id="by-root" title={t.byRoot} />
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <Chip key={c} href={`/explore?root=${c}`} active={false}>
                    {ROOT_CATEGORY[locale][c]}
                  </Chip>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
