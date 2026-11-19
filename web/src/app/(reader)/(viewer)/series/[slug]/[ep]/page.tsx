import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import type { PublishedPanel } from "@/db/schema";
import { IconBack } from "@/components/reader/icons";
import { LangToggle } from "@/components/reader/lang-toggle";
import { ProgressTracker } from "@/components/reader/progress-tracker";
import { DICT, getLocale } from "@/lib/i18n";
import { mediaUrl } from "@/lib/media";
import { getEpisode } from "@/lib/reader";

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

/** 뷰어: 세로로 이어지는 컷 위에 고른 언어의 말풍선을 얹어요. 글자 크기는 화면 폭에 맞춰 커지고 작아져요. */
export default async function Viewer({ params }: { params: Promise<{ slug: string; ep: string }> }) {
  const r = await load(params);
  if (!r?.data) notFound();
  const { locale, data } = r;
  const t = DICT[locale];
  const { series: s, episode, panels, prev, next } = data;

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[720px] items-center gap-1 pr-2">
          <Link href={`/series/${s.slug}`} aria-label={t.back} className="grid h-11 w-11 place-items-center text-ink">
            <IconBack />
          </Link>
          <p className="min-w-0 flex-1 truncate text-[14px]">
            <span className="font-semibold">{s.title}</span>
            <span className="ml-1.5 text-ink-soft">{t.episodes(episode.number)}</span>
          </p>
          <Suspense>
            <LangToggle locale={locale} label={t.langLabel} />
          </Suspense>
        </div>
      </header>

      <main className="mx-auto max-w-[720px] [container-type:inline-size]">
        <h1 className="sr-only">
          {s.title} {t.epNo(episode.number)} {episode.title}
        </h1>
        {panels.map((p, i) => (
          <Panel key={p.index} p={p} first={i === 0} n={i + 1} />
        ))}
        <ProgressTracker slug={s.slug} ep={episode.number} panelCount={panels.length} />

        <div className="px-4 py-14 text-center">
          <p className="font-serif text-[16px] text-ink-soft">{next ? t.endOfEpisode : t.nextComing}</p>
          <nav aria-label={t.list} className="mt-6 flex gap-2">
            {prev ? (
              <Link href={`/series/${s.slug}/${prev}`} className="flex h-12 flex-1 items-center justify-center rounded-[5px] border border-line bg-paper-raised text-[14px]">
                {t.prev}
              </Link>
            ) : null}
            <Link href={`/series/${s.slug}`} className="flex h-12 flex-1 items-center justify-center rounded-[5px] border border-line bg-paper-raised text-[14px]">
              {t.list}
            </Link>
            {next ? (
              <Link href={`/series/${s.slug}/${next}`} className="flex h-12 flex-1 items-center justify-center rounded-[5px] bg-ink text-[14px] font-semibold text-paper">
                {t.next}
              </Link>
            ) : null}
          </nav>
          <p className="mt-10 text-[11px] text-ink-faint">{t.aiNote}</p>
        </div>
      </main>
    </div>
  );
}

function Panel({ p, first, n }: { p: PublishedPanel; first: boolean; n: number }) {
  return (
    <figure data-panel={n} className={`relative ${first ? "" : GAP[p.gapBefore]}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mediaUrl(p.image)} alt="" className="block w-full" loading={first ? "eager" : "lazy"} />
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
