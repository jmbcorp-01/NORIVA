import { describe, expect, it } from "vitest";
import { similarSeries, sortFreshFirst } from "./reader-picks";
import type { ReaderSeries } from "./reader";

const base: ReaderSeries = {
  id: "x", slug: "x", title: "x", genre: "fantasy", logline: "", rootNote: "", cover: "", days: [], status: "ongoing",
  episodeCount: 1, latestAt: null, roots: [], altTitle: "", paid: false, waitFree: false, isDummy: false, latestNumber: 1, format: "webtoon",
};
const mk = (o: Partial<ReaderSeries>): ReaderSeries => ({ ...base, ...o });

describe("회차 끝 추천", () => {
  it("같은 뿌리 > 같은 장르 순으로, 겹치는 게 없거나 샘플이면 빼요", () => {
    const all = [
      mk({ id: "me", roots: [{ name: "바리", category: "무속" }] }),
      mk({ id: "genre", genre: "fantasy" }),
      mk({ id: "root", genre: "horror", roots: [{ name: "굿", category: "무속" }] }),
      mk({ id: "none", genre: "romance" }),
      mk({ id: "dummy", roots: [{ name: "굿", category: "무속" }], isDummy: true }),
    ];
    const got = similarSeries(all, all[0]).map((s) => s.id);
    expect(got).toEqual(["root", "genre"]);
  });
  it("샘플 작품을 보는 중이면 샘플도 추천해요", () => {
    const all = [mk({ id: "me", isDummy: true }), mk({ id: "d2", isDummy: true })];
    expect(similarSeries(all, all[0]).map((s) => s.id)).toEqual(["d2"]);
  });
});

describe("관심 목록 순서", () => {
  it("새 회차가 하루 안에 올라온 작품을 맨 위로", () => {
    const now = Date.parse("2026-11-25T00:00:00Z");
    const list = [mk({ id: "a" }), mk({ id: "b", latestAt: new Date(now - 3600e3) }), mk({ id: "c", latestAt: new Date(now - 5 * 86400e3) })];
    expect(sortFreshFirst(list, now).map((s) => s.id)).toEqual(["b", "a", "c"]);
  });
});
