import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Cover } from "@/components/reader/cover";
import { CoinIcon, IconClock, IconHeart, IconLock } from "@/components/reader/icons";
import { Badge, btn, LinkTabs } from "@/components/reader/parts";
import { UnlockSheet } from "@/components/reader/unlock-sheet";
import { toggleBookmark, unlockAction } from "@/app/reader-actions";
import { formatCountdown, type Access } from "@/lib/access-rules";
import { accessMap, readerRights, wallet } from "@/lib/commerce";
import { DAY_LABEL, DICT, genreLabel, getLocale, ROOT_CATEGORY, type Dict } from "@/lib/i18n";
import { isBookmarked, lastReadIn, readNumbers } from "@/lib/library";
import { mediaUrl } from "@/lib/media";
import { bookmarkCount, episodeThumbs, getSeries, readerCredits } from "@/lib/reader";
import { creditsForEpisode, headlineCredits, roleLabel } from "@/lib/credits";
import { currentReader } from "@/lib/reader-auth";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = await getSeries((await params).slug, await getLocale());
  return s ? { title: s.title, description: s.logline } : {};
}

export default async function SeriesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ open?: string; sort?: string; error?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const locale = await getLocale();
  const t = DICT[locale];
  const s = await getSeries(slug, locale);
  if (!s) notFound();
  const reader = await currentReader();
  const [saved, saves, thumbs, rights, last, readSet, coins, credits] = await Promise.all([
    reader ? isBookmarked(reader.id, s.id) : false,
    bookmarkCount(s.id),
    episodeThumbs(s.id, locale),
    reader ? readerRights(reader.id, s.id) : null,
    reader ? lastReadIn(reader.id, s.id) : null,
    reader ? readNumbers(reader.id, s.id) : new Set<number>(),
    reader ? wallet(reader.id) : null,
    readerCredits(s.id),
  ]);
  const novel = s.format === "novel";
  const headline = headlineCredits(credits, locale);
  const fullCredits = creditsForEpisode(credits, null);
  const access = accessMap(s.sale, s.episodes, rights);
  const latest = s.episodes[s.episodes.length - 1];
  const resumeAt = last ? (last.finished ? Math.min(last.number + 1, latest.number) : last.number) : 1;
  const dateFmt = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" });
  const days = s.days.map((d) => DAY_LABEL[locale][d]).join("·");
  const sort = sp.sort === "old" ? "old" : "new";
  const list = sort === "old" ? s.episodes : [...s.episodes].reverse();

  // 회차 열기 시트: ?open=N 이고 그 회차가 잠겨 있을 때만. 바로 열기를 켠 독자는 코인으로 바로 열어요.
  const openN = Number(sp.open);
  const openEp = s.episodes.find((e) => e.number === openN);
  const openAccess = openEp ? access.get(openEp.number) : undefined;
  if (openEp && openAccess && openAccess.kind !== "locked") redirect(`/series/${s.slug}/${openEp.number}`);

  const anyLocked = [...access.values()].some((a) => a.kind === "locked");
  const waitCard = s.sale.paid && s.sale.waitFree && !s.sale.isDummy;
  const ready = !rights?.waitFreeReadyAt || rights.waitFreeReadyAt <= new Date();
  const heroSrc = mediaUrl(s.cover);

  return (
    <>
      <div className="relative md:px-4 md:pt-6">
        {/* 휴대폰: 표지를 위에 크게. 태블릿·PC: 표지 왼쪽, 설명 오른쪽 */}
        <div className="relative h-[300px] overflow-hidden md:hidden">
          {heroSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroSrc} alt="" className="h-full w-full object-cover object-[50%_30%]" />
          ) : (
            <div className="h-full w-full bg-[#2f3a40]" />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_45%,var(--paper)_98%)]" />
        </div>
        <div className="relative -mt-16 px-4 md:mt-0 md:grid md:grid-cols-[260px_1fr] md:gap-8 md:px-0 lg:grid-cols-[300px_1fr]">
          <Cover src={s.cover} title={s.title} eager titled className="hidden md:block" />
          <div>
            <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-soft">
              {s.sale.isDummy ? <Badge kind="sample" t={t} /> : null}
              {novel ? <span className="rounded-[3px] border border-indigo px-1.5 text-[11px] font-semibold text-indigo">{t.formatNovel}</span> : null}
              {genreLabel(s.genre, locale)}
              {days ? ` · ${t.updates(days)}` : ""}
            </p>
            <h1 className="mt-1 font-serif text-[30px] font-semibold leading-tight md:text-[36px]">{s.title}</h1>
            {s.altTitle ? <p className="mt-0.5 text-[13px] text-ink-faint">{s.altTitle}</p> : null}
            <p className="mt-1.5 text-[13px] text-ink-soft">
              {headline || t.byStudio}
              {saves ? ` · ${t.saves(saves)}` : ""}
            </p>
            {s.logline ? <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">{s.logline}</p> : null}
            {s.roots.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.roots.map((r) => (
                  <Link key={r.name} href={`/explore?root=${r.category}`} className="inline-flex h-7 items-center rounded-full border border-line px-2.5 text-[12px] text-ink-soft">
                    {locale === "ko" ? r.name : ROOT_CATEGORY.en[r.category]}
                  </Link>
                ))}
              </div>
            ) : null}
            {s.sale.isDummy ? <p className="mt-4 rounded-[6px] bg-plum-soft px-3 py-2.5 text-[13px] text-plum">{t.sampleNote}</p> : null}
            <div className="mt-4 flex gap-2 md:max-w-[420px]">
              <form action={toggleBookmark}>
                <input type="hidden" name="seriesId" value={s.id} />
                <input type="hidden" name="back" value={`/series/${s.slug}`} />
                <button
                  type="submit"
                  aria-pressed={saved}
                  aria-label={saved ? t.bookmarked : t.bookmark}
                  title={saved ? t.bookmarked : t.bookmark}
                  className={`grid h-12 w-[52px] place-items-center rounded-[6px] border ${saved ? "border-seal text-seal" : "border-line-strong bg-paper-raised text-ink"}`}
                >
                  <IconHeart filled={saved} />
                </button>
              </form>
              <Link href={`/series/${s.slug}/${resumeAt}`} className={`${btn.ink} flex-1`}>
                {last ? t.continueBtn(resumeAt) : t.first}
              </Link>
            </div>
            {waitCard && anyLocked ? (
              <div className="mt-3 flex items-center gap-3 rounded-[8px] border border-[#e6d5b0] bg-ochre-soft px-3.5 py-3 text-ochre md:max-w-[420px]">
                <IconClock size={22} />
                <div className="flex-1">
                  <p className="text-[13.5px] font-bold">{ready ? t.waitFreeReady : t.waitFreeWaiting(formatCountdown(rights!.waitFreeReadyAt!))}</p>
                  <p className="mt-0.5 text-[12px] opacity-80">{t.waitFreeRule(s.sale.waitFreeExclude)}</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {s.rootNote ? (
        <section className="px-4 pt-6 md:pt-8">
          <div className="rounded-[8px] bg-paper-sunk px-5 py-4">
            <p className="text-[11px] tracking-[0.14em] text-ink-faint">{t.rootNote}</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{s.rootNote}</p>
          </div>
        </section>
      ) : null}

      <section className="pt-6" aria-labelledby="eps">
        <div className="flex items-end justify-between px-4">
          <h2 id="eps" className="pb-2.5 text-[16px] font-bold">
            {t.epCount(s.episodes.length)}
          </h2>
          <LinkTabs
            className="border-b-0"
            items={[
              { href: `/series/${s.slug}`, label: t.newest, active: sort === "new" },
              { href: `/series/${s.slug}?sort=old`, label: t.oldest, active: sort === "old" },
            ]}
          />
        </div>
        <ol className="border-t border-line md:mx-4 md:grid md:grid-cols-2 md:gap-x-6 md:border-t-0">
          {list.map((e) => {
            const a = access.get(e.number)!;
            const isRead = readSet.has(e.number);
            const href = a.kind === "locked" ? `/series/${s.slug}?open=${e.number}${sort === "old" ? "&sort=old" : ""}` : `/series/${s.slug}/${e.number}`;
            const row = `flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-paper-sunk md:px-1 ${isRead ? "opacity-55" : ""}`;
            // '다음부터 바로 열기'를 켠 독자는 시트 없이 코인으로 바로 열어요 (서버가 다시 확인)
            const direct = a.kind === "locked" && reader?.autoUnlock && (coins?.total ?? 0) >= a.price;
            const body = (
              <>
                <span className="h-[56px] w-[84px] flex-none overflow-hidden rounded-[4px] bg-[#2f3a40]">
                  {thumbs.get(e.number) || s.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(thumbs.get(e.number) ?? s.cover)} alt="" loading="lazy" className="h-full w-full object-cover object-[50%_30%]" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">
                    {t.episodes(e.number)}
                    {e.title ? ` · ${e.title}` : ""}
                  </span>
                  {e.publishAt ? (
                    <span className="mt-0.5 block text-[11.5px] text-ink-faint">
                      {dateFmt.format(e.publishAt)}
                      {e.readMinutes ? ` · ${t.readMin(e.readMinutes)}` : ""}
                    </span>
                  ) : null}
                </span>
                <EpisodeTag a={a} t={t} read={isRead} />
              </>
            );
            return (
              <li key={e.number} className="border-b border-line">
                {direct ? (
                  <form action={unlockAction}>
                    <input type="hidden" name="slug" value={s.slug} />
                    <input type="hidden" name="ep" value={e.number} />
                    <input type="hidden" name="method" value="coin" />
                    <button type="submit" className={row}>
                      {body}
                    </button>
                  </form>
                ) : (
                  <Link href={href} scroll={a.kind !== "locked"} className={row}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {fullCredits.length ? (
        <section className="px-4 pt-8" aria-labelledby="credits">
          <h2 id="credits" className="text-[13px] font-semibold text-ink-soft">
            {t.credits}
          </h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12.5px]">
            {fullCredits.map((c, i) => (
              <div key={c.id ?? i} className="contents">
                <dt className="text-ink-faint">{roleLabel(c, locale)}</dt>
                <dd className="text-ink-soft">
                  {c.name}
                  {c.aiTool ? ` (${c.aiTool})` : ""}
                  {c.fromEpisode ? ` · ${t.episodes(c.fromEpisode)}~` : ""}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11.5px] text-ink-faint">{novel ? t.aiMadeNovel : t.aiNote}</p>
        </section>
      ) : null}

      {openEp && openAccess?.kind === "locked" ? (
        <UnlockSheet
          t={t}
          slug={s.slug}
          seriesTitle={s.title}
          ep={openEp}
          access={openAccess}
          coins={coins?.total ?? null}
          loggedIn={Boolean(reader)}
          closeHref={`/series/${s.slug}${sort === "old" ? "?sort=old" : ""}`}
          waitFreeExclude={s.sale.waitFreeExclude}
          error={sp.error}
        />
      ) : null}
    </>
  );
}

function EpisodeTag({ a, t, read }: { a: Access; t: Dict; read: boolean }) {
  const cls = "flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold";
  if (a.kind === "owned") return <span className={`${cls} text-pine`}>{t.owned}</span>;
  if (a.kind === "locked") {
    if (a.early)
      return (
        <span className={`${cls} text-indigo`}>
          <IconLock /> {t.lockEarly(a.price)}
        </span>
      );
    if (a.waitFree === "ready")
      return (
        <span className={`${cls} text-ochre`}>
          <IconClock size={13} /> {t.openWait}
        </span>
      );
    return (
      <span className={cls}>
        <IconLock /> <CoinIcon size={14} /> {a.price}
      </span>
    );
  }
  if (read) return <span className={`${cls} text-ink-faint`}>{t.read}</span>;
  return <span className={`${cls} text-ink-soft`}>{t.free}</span>;
}
