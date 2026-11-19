import Link from "next/link";
import { genreLabel, ROOT_CATEGORY } from "@/lib/i18n";
import type { Locale } from "@/lib/publish";
import type { ReaderSeries } from "@/lib/reader";
import { Cover } from "./cover";

/** 3열 표지 목록. 아래 줄은 장르와 첫 번째 뿌리. */
export function SeriesGrid({ items, locale, freeLabel }: { items: ReaderSeries[]; locale: Locale; freeLabel: string }) {
  return (
    <ul className="grid grid-cols-3 gap-x-2.5 gap-y-5 sm:grid-cols-4">
      {items.map((s) => (
        <li key={s.id}>
          <Link href={`/series/${s.slug}`} className="block">
            <div className="relative">
              <Cover src={s.cover} title={s.title} />
              <span className="absolute left-1.5 top-1.5 rounded-[3px] bg-paper px-1.5 py-0.5 text-[10px] font-semibold text-ink">{freeLabel}</span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-[14px] font-semibold leading-snug">{s.title}</p>
            <p className="mt-0.5 truncate text-[12px] text-ink-faint">
              {genreLabel(s.genre, locale)}
              {s.roots[0] ? ` · ${locale === "ko" ? s.roots[0].name : ROOT_CATEGORY.en[s.roots[0].category]}` : ""}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
