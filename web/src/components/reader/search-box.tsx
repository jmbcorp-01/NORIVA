import type { Dict } from "@/lib/i18n";
import { IconSearch } from "./icons";

/** 검색창: 일반 GET 폼이라 자바스크립트 없이도 /search로 가요 */
export function SearchBox({ t, q = "" }: { t: Dict; q?: string }) {
  return (
    <form action="/search" role="search" className="flex h-11 items-center gap-2 rounded-[8px] bg-paper-sunk px-3 text-ink-faint">
      <IconSearch />
      <input name="q" defaultValue={q} placeholder={t.searchPh} aria-label={t.search} maxLength={60} className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint" />
    </form>
  );
}
