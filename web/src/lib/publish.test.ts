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

describe("이어지는 긴 세로 컷", () => {
  it("겹침 정보가 맞으면 여백 없이 잇고, 이상하면 따로 보여요", async () => {
    const { toPublishedPanels, joinStyles } = await import("./publish");
    const body = {
      kind: "lettered",
      panels: [
        { index: 1, image: "a.png", gap_before: "long", bubbles: [], sfx: null },
        { index: 2, image: "b.png", gap_before: "normal", join: { prev: 1, overlap: 0.25, margin: 33.3 }, bubbles: [], sfx: null },
        { index: 3, image: "c.png", gap_before: "none", join: { overlap: 0.9, margin: 200 }, bubbles: [], sfx: null },
      ],
    };
    const out = toPublishedPanels(body, "ko");
    expect(out[1].gapBefore).toBe("none");
    expect(out[1].join).toEqual({ overlap: 0.25, margin: 33.3 });
    expect(out[2].join).toBeUndefined();
    const js = joinStyles(out[1].join);
    expect(js.figure).toEqual({ marginTop: "-33.3%" });
    expect(js.img?.maskImage).toContain("#000 25%");
    expect(joinStyles(undefined).figure).toBeUndefined();
  });
});

describe("효과 레이어 공개본", () => {
  it("아는 효과만 옮겨요", async () => {
    const { toPublishedPanels } = await import("./publish");
    const out = toPublishedPanels(
      { kind: "lettered", panels: [{ index: 1, image: "a", effect: "focus", bubbles: [], sfx: null }, { index: 2, image: "b", effect: "glitter", bubbles: [], sfx: null }] },
      "ko",
    );
    expect(out[0].effect).toBe("focus");
    expect(out[1].effect).toBeUndefined();
  });
});
