import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import type { PublishedPanel } from "@/db/schema";
import { IconBack } from "@/components/reader/icons";
import { LangToggle } from "@/components/reader/lang-toggle";
import { ProgressTracker } from "@/components/reader/progress-tracker";
import { DICT, getLocale } from "@/lib/i18n";
import { panelSrc } from "@/lib/panel-media";
import { joinStyles } from "@/lib/publish";
import { episodeThumbs, getEpisode, listSeries, reactions, recordView } from "@/lib/reader";
import { similarSeries } from "@/lib/reader-picks";
import { Cover } from "@/components/reader/cover";
import { EffectLayer } from "@/components/reader/effect-layer";
import { canRead } from "@/lib/commerce";
import { currentReader } from "@/lib/reader-auth";
import { reactAction, toggleBookmark } from "@/app/reader-actions";
import { isBookmarked } from "@/lib/library";
import { ViewerChrome } from "@/components/reader/viewer-chrome";
import { ResumePrompt, TextSettingsButton } from "@/components/reader/text-settings";
import { episodeProgress } from "@/lib/library";
import { parseTextSettings, resumeParagraph, SCENE_BREAK, TEXT_SETTINGS_COOKIE, textStyle } from "@/lib/novel-text";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

async function load(params: Promise<{ slug: string; ep: string }>) {
  const { slug, ep } = await params;
  if (!/^\d{1,4}$/.test(ep)) return null;
  const locale = await getLocale();
  return { locale, data: await getEpisode(slug, Number(ep), locale) };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; ep: string }> }): Promise<Metadata> {
  const r = await load(params);
  if (!r?.data) return {};
  return { title: `${r.data.series.title} ${DICT[r.locale].episodes(r.data.episode.number)}` };
}

const GAP = { none: "mt-0", normal: "mt-6", long: "mt-20" } as const;

/**
 * 뷰어: 웹툰은 세로로 이어지는 컷 위에 고른 언어의 말풍선을 얹어요. 글자 크기는 화면 폭에 맞춰 커지고 작아져요.
 * 웹소설은 문단을 이어 보여주고, 독자가 고른 글자 크기·줄 간격·글꼴·배경을 써요 (07번 2단계).
 */
export default async function Viewer({ params }: { params: Promise<{ slug: string; ep: string }> }) {
  const r = await load(params);
  if (!r?.data) notFound();
  const { locale, data } = r;
  const t = DICT[locale];
  const { series: s, episode, prev, next } = data;
  const novel = data.kind === "novel";
  const panels = data.kind === "webtoon" ? data.panels : [];

  // 그림을 보여주기 전에 서버에서 볼 수 있는지 확인해요. 잠긴 회차면 회차 열기 시트로 보내요.
  const reader = await currentReader();
  const gate = await canRead(reader?.id ?? null, s.slug, episode.number);
  if (!gate.ok) redirect(`/series/${s.slug}?open=${episode.number}`);
  await recordView(s.id, episode.id, reader?.id ?? null);
  const react = await reactions(episode.id, reader?.id ?? null);
  const saved = !next && reader ? await isBookmarked(reader.id, s.id) : false;
  // 회차 끝: 다음 화 미리보기(첫 컷)와 비슷한 뿌리의 작품
  const [thumbs, all] = await Promise.all([next ? episodeThumbs(s.id, locale) : Promise.resolve(new Map<number, string>()), listSeries(locale)]);
  const nextEp = next ? s.episodes.find((e) => e.number === next) : null;
  const nextThumb = next ? thumbs.get(next) : undefined;
  const picks = similarSeries(all, { id: s.id, genre: s.genre, roots: s.roots, isDummy: s.sale.isDummy, format: s.format });
  // 웹소설 보기 설정(이 기기 쿠키)과 이어 읽기 위치
  const textSettings = novel ? parseTextSettings((await cookies()).get(TEXT_SETTINGS_COOKIE)?.value) : null;
  const paragraphs = data.kind === "novel" ? data.paragraphs : [];
  const seen = novel && reader ? await episodeProgress(reader.id, episode.id) : null;
  const resumeAt = seen ? resumeParagraph(seen.max, paragraphs.length) : null;
  const nav = "flex h-12 flex-1 items-center justify-center rounded-[6px] border border-line bg-paper-raised text-[14px]";

  return (
    <div
      id="viewer-root"
      className="min-h-dvh bg-paper text-ink"
      data-font={textSettings?.font}
      data-theme-text={textSettings?.theme}
      style={textSettings ? (textStyle(textSettings) as React.CSSProperties) : undefined}
    >
      <ViewerChrome
        top={
          <div className="mx-auto flex h-14 max-w-[720px] items-center gap-1 pr-2">
            <Link href={`/series/${s.slug}`} aria-label={t.back} className="grid h-11 w-11 place-items-center text-ink">
              <IconBack />
            </Link>
            <p className="min-w-0 flex-1 truncate text-[15px]">
              <span className="font-bold">{s.title}</span>
              <span className="ml-1.5 text-ink-faint">{t.episodes(episode.number)}</span>
            </p>
            {textSettings ? (
              <TextSettingsButton
                rootId="viewer-root"
                initial={textSettings}
                labels={{
                  textSettings: t.textSettings,
                  textSize: t.textSize,
                  lineHeight: t.lineHeight,
                  textFont: t.textFont,
                  fontSerif: t.fontSerif,
                  fontSans: t.fontSans,
                  textTheme: t.textTheme,
                  themePaper: t.themePaper,
                  themeSepia: t.themeSepia,
                  themeNight: t.themeNight,
                  close: t.close,
                  lineTight: t.lineTight,
                  lineNormal: t.lineNormal,
                  lineWide: t.lineWide,
                }}
              />
            ) : null}
            <Suspense>
              <LangToggle locale={locale} label={t.langLabel} />
            </Suspense>
          </div>
        }
        bottom={
          <nav aria-label={t.list} className="mx-auto flex h-14 max-w-[720px] items-center justify-between px-4 text-[13.5px] text-ink-soft">
            {prev ? <Link href={`/series/${s.slug}/${prev}`}>‹ {t.prev}</Link> : <span className="opacity-40">‹ {t.prev}</span>}
            <a href="#react" className="flex gap-4">
              <span>
                {t.fun}
                {react.fun ? ` ${react.fun.toLocaleString()}` : ""}
              </span>
            </a>
            {next ? (
              <Link href={`/series/${s.slug}/${next}`} className="font-bold text-ink">
                {t.next} ›
              </Link>
            ) : (
              <span className="opacity-40">{t.next} ›</span>
            )}
          </nav>
        }
      >
        <main className="mx-auto max-w-[720px] pt-[calc(56px+env(safe-area-inset-top))] [container-type:inline-size]">
          <h1 className="sr-only">
            {s.title} {t.epNo(episode.number)} {episode.title}
          </h1>
          {data.kind === "novel" ? (
            <>
              {resumeAt ? <ResumePrompt at={resumeAt} ask={t.resumeAsk} go={t.resumeGo} close={t.close} /> : null}
              {data.textLocale !== locale && t.koOnly ? <p className="mx-4 mt-4 rounded-[6px] bg-paper-sunk px-3 py-2.5 text-[13px] text-ink-soft">{t.koOnly}</p> : null}
              <NovelBody
                paragraphs={paragraphs}
                no={t.epNo(episode.number)}
                title={episode.title}
                minutes={data.readMinutes ? t.readMin(data.readMinutes) : ""}
                lang={data.textLocale}
              />
            </>
          ) : (
            panels.map((p, i) => <Panel key={p.index} p={p} first={i === 0} n={i + 1} />)
          )}
          <ProgressTracker slug={s.slug} ep={episode.number} panelCount={novel ? paragraphs.length : panels.length} />

          <div className="px-4 pb-28 pt-14 text-center">
            {s.sale.isDummy ? <p className="mx-auto mb-6 max-w-[420px] rounded-[6px] bg-plum-soft px-3 py-2.5 text-[13px] text-plum">{t.sampleNote}</p> : null}
            <p className="font-serif text-[16px] text-ink-soft">{next ? t.endOfEpisode : t.nextComing}</p>
            {nextEp ? (
              <Link
                href={`/series/${s.slug}/${nextEp.number}`}
                className="mx-auto mt-4 flex max-w-[420px] items-center gap-3 rounded-[8px] border border-line bg-paper-raised p-2.5 text-left hover:bg-paper-sunk"
              >
                {nextThumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={panelSrc(nextThumb)} alt="" className="h-[72px] w-[96px] flex-none rounded-[5px] object-cover" loading="lazy" />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] text-ink-faint">{t.nextUp}</span>
                  <span className="mt-0.5 block truncate text-[15px] font-semibold">
                    {t.epNo(nextEp.number)} {nextEp.title}
                  </span>
                </span>
                <span className="pr-1 text-[18px] text-ink-faint">›</span>
              </Link>
            ) : null}
            {!next ? (
              <form action={toggleBookmark} className="mt-3">
                <input type="hidden" name="seriesId" value={s.id} />
                <input type="hidden" name="back" value={`/series/${s.slug}/${episode.number}`} />
                <p className="text-[13px] text-ink-soft">{t.followForNext}</p>
                <button
                  type="submit"
                  aria-pressed={saved}
                  className={`mt-2 h-11 min-w-[180px] rounded-full border px-4 text-[14px] font-semibold ${saved ? "border-seal text-seal" : "border-ink bg-ink text-paper"}`}
                >
                  {saved ? t.bookmarked : t.bookmark}
                </button>
              </form>
            ) : null}
            <section id="react" aria-label={t.howWas} className="mt-6">
              <p className="text-[13px] text-ink-faint">{t.howWas}</p>
              <div className="mt-3 flex justify-center gap-2">
                {(["fun", "meh"] as const).map((k) => (
                  <form key={k} action={reactAction}>
                    <input type="hidden" name="slug" value={s.slug} />
                    <input type="hidden" name="ep" value={episode.number} />
                    <input type="hidden" name="kind" value={k} />
                    <button
                      type="submit"
                      aria-pressed={react.mine === k}
                      className={`h-11 min-w-[128px] rounded-full border px-4 text-[14px] font-semibold ${react.mine === k ? "border-ink bg-ink text-paper" : "border-line-strong bg-paper-raised text-ink"}`}
                    >
                      {k === "fun" ? t.fun : t.meh}
                      {react[k] ? ` ${react[k].toLocaleString()}` : ""}
                    </button>
                  </form>
                ))}
              </div>
            </section>
            {picks.length ? (
              <section aria-label={t.alsoLike} className="mt-10 text-left">
                <p className="text-[13px] font-semibold">{t.alsoLike}</p>
                <ul className="mt-2 grid grid-cols-3 gap-2.5">
                  {picks.map((x) => (
                    <li key={x.id}>
                      <Link href={`/series/${x.slug}`} className="block">
                        <Cover src={x.cover} title={x.title} titled />
                        <span className="mt-1 block truncate text-[12.5px] font-semibold">{x.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <nav aria-label={t.list} className="mt-10 flex gap-2">
              {prev ? (
                <Link href={`/series/${s.slug}/${prev}`} className={nav}>
                  {t.prev}
                </Link>
              ) : null}
              <Link href={`/series/${s.slug}`} className={nav}>
                {t.list}
              </Link>
              {next ? (
                <Link href={`/series/${s.slug}/${next}`} className="flex h-12 flex-1 items-center justify-center rounded-[6px] bg-ink text-[14px] font-bold text-paper">
                  {t.next}
                </Link>
              ) : null}
            </nav>
            <p className="mt-10 text-[11px] text-ink-faint">{novel ? t.aiMadeNovel : t.aiNote}</p>
            <p className="mt-1 text-[11px] text-ink-faint">{t.copyrightLine}</p>
          </div>
        </main>
      </ViewerChrome>
    </div>
  );
}

/** 웹소설 본문. 문단마다 번호(data-panel)를 붙여 어디까지 읽었는지 기록해요 */
function NovelBody({ paragraphs, no, title, minutes, lang }: { paragraphs: string[]; no: string; title: string; minutes: string; lang: string }) {
  return (
    <article lang={lang} className="px-5 pb-4 pt-10 font-serif in-data-[font=sans]:font-sans md:px-10">
      <header className="mb-12 text-center">
        <p className="text-[13px] text-ink-faint">{no}</p>
        {title ? <h2 className="mt-1.5 font-serif text-[23px] font-semibold leading-snug">{title}</h2> : null}
        {minutes ? <p className="mt-2 text-[12px] text-ink-faint">{minutes}</p> : null}
      </header>
      <div className="break-keep text-ink" style={{ fontSize: "var(--nv-size, 17px)", lineHeight: "var(--nv-line, 1.8)" }}>
        {paragraphs.map((p, i) =>
          p === SCENE_BREAK ? (
            <div key={i} data-panel={i + 1} role="separator" className="my-[2.2em] text-center text-[0.8em] tracking-[0.6em] text-ink-faint">
              ＊＊＊
            </div>
          ) : (
            <p key={i} data-panel={i + 1} className="mb-[0.95em]">
              {p}
            </p>
          ),
        )}
      </div>
    </article>
  );
}

function Panel({ p, first, n }: { p: PublishedPanel; first: boolean; n: number }) {
  // 이어지는 긴 세로 컷은 앞 컷 아래 끝에 겹쳐 여백 없이 한 장처럼 보여요
  const join = first ? undefined : p.join;
  const js = joinStyles(join);
  return (
    <figure data-panel={n} className={`relative ${first || join ? "" : GAP[p.gapBefore]}`} style={js.figure}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={panelSrc(p.image)} alt="" className="block w-full" style={js.img} loading={first ? "eager" : "lazy"} />
      <EffectLayer kind={p.effect} seed={p.index} />
      {p.bubbles.map((b, i) => (
        <BubbleView key={i} b={b} />
      ))}
      {p.sfx ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute font-serif font-bold text-[#fbf9f4] [text-shadow:0_0_3px_#24221f,0_0_1px_#24221f]"
          style={{
            left: `${p.sfx.x}%`,
            top: `${p.sfx.y}%`,
            fontSize: `${Math.max(3, p.sfx.size * 0.55)}cqw`,
            transform: `translate(-50%, -50%) rotate(${p.sfx.angle}deg)`,
          }}
        >
          {p.sfx.text}
        </span>
      ) : null}
    </figure>
  );
}

function BubbleView({ b }: { b: PublishedPanel["bubbles"][number] }) {
  const shape =
    b.shape === "narration"
      ? "rounded-[2px] border border-[#24221f]/25 bg-[#fbf9f4]/95"
      : b.shape === "thought"
        ? "rounded-[40%] border border-dashed border-[#24221f]/50 bg-[#fbf9f4]/95"
        : b.shape === "shout"
          ? "rounded-[6px] border-2 border-[#24221f] bg-[#fbf9f4]"
          : "rounded-[50%] border border-[#24221f]/70 bg-[#fbf9f4]";
  return (
    <>
      {b.tail ? (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line
            x1={b.box.x + b.box.w / 2}
            y1={b.box.y + b.box.h / 2}
            x2={b.tail.x}
            y2={b.tail.y}
            stroke="#24221F"
            strokeOpacity="0.7"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}
      <p
        className={`absolute grid place-items-center px-[5%] py-[1.2cqw] text-center leading-snug text-[#24221f] ${shape} ${b.shape === "whisper" ? "italic" : ""}`}
        style={{
          left: `${b.box.x}%`,
          top: `${b.box.y}%`,
          width: `${b.box.w}%`,
          minHeight: `${b.box.h}%`,
          fontSize: "clamp(12px, 3.4cqw, 19px)",
          fontWeight: b.shape === "shout" ? 700 : 500,
        }}
      >
        {b.text}
      </p>
    </>
  );
}
