import { describe, expect, it } from "vitest";
import { agreement, setVerdict } from "./judge";

describe("검사기 눈 맞추기", () => {
  it("대표 판정과 검사기 판정이 얼마나 맞는지 세요", () => {
    const a = agreement([
      { index: 1, image: "a", passed: true, owner_verdict: "good" },
      { index: 2, image: "b", passed: true, owner_verdict: "ai" },
      { index: 3, image: "c", passed: false, owner_verdict: "good" },
      { index: 4, image: "d", passed: false, owner_verdict: "ai" },
      { index: 5, image: "e", passed: true },
    ]);
    expect(a).toEqual({ judged: 4, agree: 2, pct: 50, missed: [2], strict: [3] });
  });
  it("판정을 적고 지워요", () => {
    const body = { kind: "art", panels: [{ index: 1, image: "a" }] };
    const on = setVerdict(body, 1, "ai", " 눈이 번들거림 ") as { panels: Record<string, unknown>[] };
    expect(on.panels[0]).toEqual({ index: 1, image: "a", owner_verdict: "ai", owner_note: "눈이 번들거림" });
    const off = setVerdict(on, 1, null, "") as { panels: Record<string, unknown>[] };
    expect(off.panels[0]).toEqual({ index: 1, image: "a" });
    expect(() => setVerdict({ kind: "lettered", panels: [] }, 1, "ai", "")).toThrow();
  });
});
