import { describe, expect, it } from "vitest";
import { applyFields, fieldGroups } from "./artifact-fields";

describe("직접 고치기 입력란", () => {
  it("작화: 컷 설명과 대사만 바꾸고 나머지는 그대로", () => {
    const body = { kind: "art", panels: [{ index: 1, description: "old", image: "k.png", dialogue: [{ speaker: "hana", text: "안녕" }] }] };
    const g = fieldGroups(body);
    expect(g[0].rows.map((r) => r.name)).toEqual(["p1.description", "p1.d0"]);
    const out = applyFields(body, new Map([["p1.d0", " 안녕하세요 "], ["p9.description", "없는 컷"]])) as typeof body;
    expect(out.panels[0]).toEqual({ index: 1, description: "old", image: "k.png", dialogue: [{ speaker: "hana", text: "안녕하세요" }] });
  });
  it("말풍선: 한국어·영어 글만 바꿔요", () => {
    const body = { kind: "lettered", panels: [{ index: 2, bubbles: [{ shape: "speech", text: { ko: "가", en: "a" }, box: { x: 1 } }] }] };
    const out = applyFields(body, new Map([["p2.b0.en", "b"]])) as typeof body;
    expect(out.panels[0].bubbles[0]).toEqual({ shape: "speech", text: { ko: "가", en: "b" }, box: { x: 1 } });
  });
  it("다른 결과는 입력란이 없어요", () => {
    expect(fieldGroups({ markdown: "x" })).toEqual([]);
    expect(() => applyFields({ markdown: "x" }, new Map())).toThrow();
  });
});
