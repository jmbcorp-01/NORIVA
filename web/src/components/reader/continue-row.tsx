import Link from "next/link";
import type { Dict } from "@/lib/i18n";
import type { ContinueItem } from "@/lib/library";
import { Cover } from "./cover";

/** 이어보기 가로 줄: 표지, 제목, 어디까지 봤는지, 이어볼 회차 */
export function ContinueRow({ items, t }: { items: ContinueItem[]; t: Dict }) {
  return (
    <ul className="flex gap-2.5 overflow-x-auto px-4 pb-1 pt-3">
      {items.map((it) => {
        const ep = it.nextEpisode ?? it.lastEpisode;
        return (
          <li key={it.series.id} className="flex-none">
            <Link
              href={`/series/${it.series.slug}/${ep}`}
              className="flex w-[248px] gap-3 rounded-[6px] border border-line bg-paper-raised p-2.5"
            >
              <Cover src={it.series.cover} title={it.series.title} className="w-[54px] flex-none" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[14px] font-semibold">{it.series.title}</span>
                <span className="mt-0.5 text-[12px] text-ink-faint">{t.readUpTo(it.lastEpisode)}</span>
                <span className="mt-auto text-[12px] font-medium text-indigo">
                  {it.nextEpisode ? t.continueEp(it.nextEpisode) : t.nextComing}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
