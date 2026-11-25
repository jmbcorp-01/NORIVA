import { describe, expect, it } from "vitest";
import { novelChars, parseTextSettings, readMinutes, resumeParagraph, SCENE_BREAK, toNovelParagraphs, DEFAULT_TEXT_SETTINGS } from "./novel-text";
import { episodeAccess } from "./access-rules";

describe("웹소설 공개본", () => {
  it("첫 제목 줄은 빼고, 장면 바꿈은 하나로 맞춰요", () => {
    const md = "# 1화 소금길\n\n**새벽**이었다.\n\n* * *\n\n***\n\n문이 열렸다.\n> 누구냐.\n\n---\n";
    expect(toNovelParagraphs(md)).toEqual(["새벽이었다.", SCENE_BREAK, "문이 열렸다.", "누구냐."]);
  });

  it("글자 수와 읽는 시간", () => {
    const p = ["가 나 다", SCENE_BREAK, "라마"];
    expect(novelChars(p)).toBe(7);
    expect(readMinutes(5200)).toBe(8);
    expect(readMinutes(10)).toBe(1);
  });
});

describe("글 뷰어 설정", () => {
  it("망가진 쿠키는 기본값으로 읽어요", () => {
    expect(parseTextSettings("{oops")).toEqual(DEFAULT_TEXT_SETTINGS);
    expect(parseTextSettings(encodeURIComponent(JSON.stringify({ size: 9, line: 2, font: "sans", theme: "night" })))).toEqual({ size: 1, line: 2, font: "sans", theme: "night" });
  });

  it("이어 읽기는 중간에 멈췄을 때만", () => {
    expect(resumeParagraph(40, 80)).toBe(40);
    expect(resumeParagraph(2, 80)).toBeNull();
    expect(resumeParagraph(80, 80)).toBeNull();
  });
});

describe("웹소설 판매 기준", () => {
  const novel = { paid: true, freeEpisodes: 10, waitFree: true, isDummy: false, waitFreeExclude: 10, earlyPrice: 2 };
  it("10화까지 무료, 최신 10화는 기다무에서 빠져요", () => {
    expect(episodeAccess(novel, { number: 10, priceCoins: 1, earlyAccess: false }, 30, null).kind).toBe("free");
    const a = episodeAccess(novel, { number: 21, priceCoins: 1, earlyAccess: false }, 30, null);
    expect(a).toMatchObject({ kind: "locked", price: 1, waitFree: "excluded" });
    expect(episodeAccess(novel, { number: 20, priceCoins: 1, earlyAccess: false }, 30, null)).toMatchObject({ waitFree: "ready" });
  });
  it("선공개는 2코인", () => {
    expect(episodeAccess(novel, { number: 31, priceCoins: 1, earlyAccess: true }, 30, null)).toMatchObject({ price: 2, early: true });
  });
});
