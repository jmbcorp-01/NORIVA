import Link from "next/link";
import type { ReactNode } from "react";
import type { Dict } from "@/lib/i18n";
import { genreLabel } from "@/lib/i18n";
import type { Locale } from "@/lib/publish";
import type { ReaderSeries } from "@/lib/reader";
import { Cover } from "./cover";

/** 독자 화면 공통 조각: 표지 카드, 배지, 섹션 제목, 가로 줄, 링크 탭. 화면마다 따로 만들지 않고 여기서 같이 써요. */

export type BadgeKind = "up" | "wait" | "free" | "early" | "done" | "sample";
const BADGE_TONE: Record<BadgeKind, string> = {
  up: "bg-seal",
  wait: "bg-ochre",
  free: "bg-pine",
  early: "bg-indigo",
  done: "bg-[#3b3833]",
  sample: "bg-plum",
};

export function Badge({ kind, t, className = "" }: { kind: BadgeKind; t: Dict; className?: string }) {
  const label = { up: t.badgeUp, wait: t.badgeWait, free: t.badgeFree, early: t.badgeEarly, done: t.badgeDone, sample: t.badgeSample }[kind];
  return <span className={`rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold leading-none tracking-[0.02em] text-white ${BADGE_TONE[kind]} ${className}`}>{label}</span>;
}

/** 표지 위 배지 하나: 샘플 > 오늘 올라옴 > 완결 > 기다무 > 무료 */
export function seriesBadge(s: ReaderSeries, now = Date.now()): BadgeKind | null {
  if (s.isDummy) return "sample";
  if (s.latestAt && now - s.latestAt.getTime() < 24 * 3600 * 1000) return "up";
  if (s.status === "completed") return "done";
  if (s.paid && s.waitFree) return "wait";
  if (!s.paid) return "free";
  return null;
}

export function SeriesCard({ s, locale, t, badge, eager = false }: { s: ReaderSeries; locale: Locale; t: Dict; badge?: BadgeKind | null; eager?: boolean }) {
  const b = badge === undefined ? seriesBadge(s) : badge;
  return (
    <Link href={`/series/${s.slug}`} className="group block">
      <div className="relative">
        <Cover src={s.cover} title={s.title} eager={eager} className="transition-transform duration-200 group-hover:-translate-y-0.5" />
        {b ? <Badge kind={b} t={t} className="absolute left-1.5 top-1.5" /> : null}
      </div>
      <p className="mt-1.5 line-clamp-2 text-[13.5px] font-semibold leading-snug">{s.title}</p>
      <p className="mt-0.5 truncate text-[11.5px] text-ink-faint">{genreLabel(s.genre, locale)}</p>
    </Link>
  );
}

/** 반응형 표지 격자: 휴대폰 3열, 태블릿 4~5열, PC 6열 */
export function SeriesGrid({ items, locale, t, badge }: { items: ReaderSeries[]; locale: Locale; t: Dict; badge?: (s: ReaderSeries) => BadgeKind | null }) {
  return (
    <ul className="grid grid-cols-3 gap-x-2.5 gap-y-5 md:grid-cols-4 md:gap-x-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((s) => (
        <li key={s.id}>
          <SeriesCard s={s} locale={locale} t={t} badge={badge ? badge(s) : undefined} />
        </li>
      ))}
    </ul>
  );
}

/** 가로로 넘기는 표지 줄. PC에서는 넘치지 않게 격자로 펼쳐요. */
export function Shelf({ items, locale, t, badge }: { items: ReaderSeries[]; locale: Locale; t: Dict; badge?: (s: ReaderSeries) => BadgeKind | null }) {
  return (
    <ul className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-5 md:gap-4 md:overflow-visible md:px-0 xl:grid-cols-6">
      {items.map((s) => (
        <li key={s.id} className="w-[30%] flex-none snap-start md:w-auto">
          <SeriesCard s={s} locale={locale} t={t} badge={badge ? badge(s) : undefined} />
        </li>
      ))}
    </ul>
  );
}

export function SectionHead({ id, title, aside, href }: { id?: string; title: string; aside?: string; href?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-[17px] font-bold md:text-[19px]">
        {title}
      </h2>
      {aside ? (
        href ? (
          <Link href={href} className="py-1 text-[12.5px] text-ink-faint hover:text-ink">
            {aside}
          </Link>
        ) : (
          <span className="text-[12.5px] text-ink-faint">{aside}</span>
        )
      ) : null}
    </div>
  );
}

/** 밑줄 탭 (링크). 현재 탭은 aria-current로 알려요. */
export function LinkTabs({ items, className = "" }: { items: { href: string; label: string; active: boolean }[]; className?: string }) {
  return (
    <nav className={`flex overflow-x-auto border-b border-line text-[14px] ${className}`}>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          scroll={false}
          aria-current={i.active ? "page" : undefined}
          className={`whitespace-nowrap px-3 pb-2.5 pt-2 ${i.active ? "font-bold text-ink shadow-[inset_0_-2px_0_var(--ink)]" : "text-ink-faint hover:text-ink"}`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function Chip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-8 flex-none items-center whitespace-nowrap rounded-full border px-3 text-[13px] ${
        active ? "border-ink bg-ink font-semibold text-paper" : "border-line bg-paper-raised text-ink-soft hover:border-line-strong"
      }`}
    >
      {children}
    </Link>
  );
}

/** 진행 막대 (0~100) */
export function Progress({ value, tone = "ochre" }: { value: number; tone?: "ochre" | "ink" }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-paper-sunk" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <div className={`h-full ${tone === "ink" ? "bg-ink" : "bg-ochre"}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/** 버튼 모양 (링크·버튼 모두) */
export const btn = {
  ink: "inline-flex h-12 items-center justify-center rounded-[6px] bg-[#211f1c] px-4 text-[15px] font-bold text-[#f6f2ea] hover:bg-black dark:bg-ink dark:text-paper",
  seal: "inline-flex h-12 items-center justify-center rounded-[6px] bg-seal px-4 text-[15px] font-bold text-[#fbf3ee] hover:brightness-110",
  ghost: "inline-flex h-12 items-center justify-center rounded-[6px] border border-line-strong bg-paper-raised px-4 text-[15px] font-semibold text-ink hover:bg-paper-sunk",
  small: "inline-flex h-9 items-center justify-center rounded-[6px] px-3 text-[13px] font-bold",
};

/** 화면 제목 (탐색, 내 서재, 내 정보 등) */
export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-[24px] font-bold md:text-[28px]">{children}</h1>;
}

/** 목록 줄 (내 정보 메뉴 등) */
export function MenuRow({ href, label, value }: { href: string; label: string; value?: string }) {
  return (
    <Link href={href} className="flex items-center justify-between border-b border-line px-4 py-4 text-[15px] hover:bg-paper-sunk md:px-0">
      <span>{label}</span>
      <span className="text-[13px] text-ink-faint">{value ? `${value} ›` : "›"}</span>
    </Link>
  );
}
