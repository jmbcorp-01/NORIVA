import { describe, expect, it } from "vitest";
import { replacePanel } from "./hand-edit";

describe("핵심 컷 손보기", () => {
  it("그 컷 그림만 바꾸고 원래 그림을 남겨요", () => {
    const body = { kind: "art", panels: [{ index: 1, image: "a.png", passed: false, defects: [{ code: "AI-1" }] }, { index: 2, image: "b.png" }] };
    const out = replacePanel(body, 1, "hand.png") as { panels: Record<string, unknown>[] };
    expect(out.panels[0]).toMatchObject({ image: "hand.png", raw_image: "a.png", hand_edited: true, passed: true, defects: [] });
    expect(out.panels[1]).toEqual({ index: 2, image: "b.png" });
    // 두 번 바꿔도 처음 그림을 기억해요
    const again = replacePanel(out, 1, "hand2.png") as { panels: Record<string, unknown>[] };
    expect(again.panels[0].raw_image).toBe("a.png");
  });
  it("없는 컷이나 다른 결과는 막아요", () => {
    expect(() => replacePanel({ kind: "art", panels: [] }, 3, "x")).toThrow();
    expect(() => replacePanel({ markdown: "x" }, 1, "x")).toThrow();
  });
});
