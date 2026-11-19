import { describe, expect, it } from "vitest";
import { PublishError, toPublishedPanels } from "./publish";

const body = {
  kind: "lettered",
  panels: [
    {
      index: 1,
      image: "series/a/ep001/art/x/001-1.png",
      gap_before: "long",
      bubbles: [{ shape: "speech", text: { ko: "왜 안 녹아?", en: "Why won't it melt?" }, box: { x: 1, y: 2, w: 30, h: 10 }, tail: null }],
      sfx: { text: { ko: "사각", en: "" }, x: 50, y: 50, size: 10, angle: 0 },
    },
    { index: 2, image: "k2.png", gap_before: "weird", bubbles: [], sfx: null },
  ],
};

describe("toPublishedPanels", () => {
  it("언어별 글자만 남기고 위치는 그대로 써요", () => {
    const ko = toPublishedPanels(body, "ko");
    const en = toPublishedPanels(body, "en");
    expect(ko[0].bubbles[0].text).toBe("왜 안 녹아?");
    expect(en[0].bubbles[0].text).toBe("Why won't it melt?");
    expect(en[0].bubbles[0].box).toEqual(ko[0].bubbles[0].box);
  });
  it("영어 효과음이 없으면 한국어 효과음을 써요", () => {
    expect(toPublishedPanels(body, "en")[0].sfx?.text).toBe("사각");
  });
  it("모르는 여백 값은 보통으로", () => {
    expect(toPublishedPanels(body, "ko")[1].gapBefore).toBe("normal");
  });
  it("번역이 빠진 대사가 있으면 공개하지 않아요", () => {
    const broken = structuredClone(body);
    broken.panels[0].bubbles[0].text.en = " ";
    expect(() => toPublishedPanels(broken, "en")).toThrow(PublishError);
  });
  it("말풍선 결과가 아니면 거절", () => {
    expect(() => toPublishedPanels({ kind: "art", panels: [] }, "ko")).toThrow(PublishError);
  });
});
