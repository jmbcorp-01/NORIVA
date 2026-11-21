import { describe, expect, it } from "vitest";
import { episodeAccess, formatCountdown, latestRegularNumber, splitSpend, type SeriesSale } from "./access-rules";

const paid: SeriesSale = { paid: true, freeEpisodes: 3, waitFree: true, isDummy: false };
const ep = (number: number, earlyAccess = false) => ({ number, priceCoins: 3, earlyAccess });
const none = { owned: new Set<number>(), passActive: false, waitFreeReadyAt: null };
const now = new Date("2026-11-21T00:00:00Z");

describe("episodeAccess", () => {
  it("무료 작품, 처음 N화, 샘플은 무료", () => {
    expect(episodeAccess({ ...paid, paid: false }, ep(10), 20, null).kind).toBe("free");
    expect(episodeAccess(paid, ep(3), 20, null).kind).toBe("free");
    expect(episodeAccess({ ...paid, isDummy: true }, ep(10), 20, null).kind).toBe("free");
  });
  it("연 회차는 소장, 패스는 선공개만 빼고", () => {
    expect(episodeAccess(paid, ep(5), 20, { ...none, owned: new Set([5]) }).kind).toBe("owned");
    expect(episodeAccess(paid, ep(5), 20, { ...none, passActive: true }).kind).toBe("pass");
    expect(episodeAccess(paid, ep(21, true), 20, { ...none, passActive: true }).kind).toBe("locked");
  });
  it("최신 3화와 선공개는 기다무에서 빠지고, 선공개는 5코인 이상", () => {
    const a = episodeAccess(paid, ep(18), 20, none, now);
    expect(a).toMatchObject({ kind: "locked", waitFree: "excluded" });
    const e = episodeAccess(paid, ep(21, true), 20, none, now);
    expect(e).toMatchObject({ kind: "locked", waitFree: "excluded", price: 5, early: true });
    expect(episodeAccess(paid, ep(17), 20, none, now)).toMatchObject({ waitFree: "ready", price: 3 });
  });
  it("기다무 시간이 남으면 waiting과 남은 시각", () => {
    const at = new Date(now.getTime() + 3600_000);
    expect(episodeAccess(paid, ep(5), 20, { ...none, waitFreeReadyAt: at }, now)).toMatchObject({ waitFree: "waiting", waitFreeAt: at });
    expect(episodeAccess({ ...paid, waitFree: false }, ep(5), 20, none, now)).toMatchObject({ waitFree: "off" });
  });
});

describe("helpers", () => {
  it("latestRegularNumber는 선공개를 빼요", () => {
    expect(latestRegularNumber([ep(1), ep(2), ep(3, true)])).toBe(2);
  });
  it("splitSpend는 보너스부터, 모자라면 null", () => {
    expect(splitSpend({ paid: 10, free: 2 }, 5)).toEqual({ free: 2, paid: 3 });
    expect(splitSpend({ paid: 1, free: 1 }, 5)).toBeNull();
  });
  it("formatCountdown", () => {
    expect(formatCountdown(new Date(now.getTime() + 3723_000), now)).toBe("01:02:03");
    expect(formatCountdown(new Date(now.getTime() - 1000), now)).toBe("00:00:00");
  });
});
