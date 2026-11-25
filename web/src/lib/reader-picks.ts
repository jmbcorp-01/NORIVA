import type { ReaderSeries } from "./reader";

const DAY = 24 * 3600 * 1000;

/** 관심 목록: 새 회차가 올라온 작품(하루 안)을 맨 위로, 나머지는 담은 순서 그대로. */
export function sortFreshFirst(list: ReaderSeries[], now = Date.now()): ReaderSeries[] {
  const fresh = (s: ReaderSeries) => Boolean(s.latestAt && now - s.latestAt.getTime() < DAY);
  return [...list.filter(fresh).sort((a, b) => b.latestAt!.getTime() - a.latestAt!.getTime()), ...list.filter((s) => !fresh(s))];
}

/**
 * 회차 끝 추천: 같은 뿌리(설화·민속 분류)를 가장 높게, 같은 장르를 그다음으로 쳐요.
 * 지금 작품과 겹치는 게 하나도 없는 작품은 빼고, 진짜 작품이면 샘플 작품은 추천하지 않아요.
 */
export function similarSeries(all: ReaderSeries[], current: { id: string; genre: string; roots: { category: string }[]; isDummy?: boolean }, n = 3): ReaderSeries[] {
  const cats = new Set(current.roots.map((r) => r.category));
  const score = (s: ReaderSeries) => 2 * s.roots.filter((r) => cats.has(r.category)).length + (s.genre === current.genre ? 1 : 0);
  return all
    .filter((s) => s.id !== current.id && (current.isDummy || !s.isDummy))
    .map((s) => ({ s, k: score(s) }))
    .filter((x) => x.k > 0)
    .sort((a, b) => b.k - a.k || (b.s.latestAt?.getTime() ?? 0) - (a.s.latestAt?.getTime() ?? 0))
    .slice(0, n)
    .map((x) => x.s);
}
