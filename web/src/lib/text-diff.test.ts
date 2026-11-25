import { describe, expect, it } from "vitest";
import { diffParagraphs, diffSummary, diffWords } from "./text-diff";

describe("퇴고 전후 비교", () => {
  it("바뀐 글자만 표시해요", () => {
    expect(diffWords("그는 문을 열었다.", "그는 문을 조용히 열었다.")).toEqual([
      { t: "same", s: "그는 문을 " },
      { t: "ins", s: "조용히 " },
      { t: "same", s: "열었다." },
    ]);
    expect(diffWords("바람소리가", "바람 소리가")).toEqual([
      { t: "same", s: "바람" },
      { t: "ins", s: " " },
      { t: "same", s: "소리가" },
    ]);
  });

  it("전혀 다른 문단은 바뀐 문단으로 묶지 않아요", () => {
    const d = diffParagraphs("가나다\n\n* * *\n\n아침이 되자 모였다.", "가나다\n\n아침이 되자 창고 앞에 모였다.");
    expect(d.map((x) => x.kind)).toEqual(["same", "removed", "changed"]);
  });

  it("같은 문단은 그대로, 바뀐 문단은 묶어서 보여줘요", () => {
    const before = "첫 문단.\n\n둘째 문단 틀린말.\n\n지울 문단.";
    const after = "첫 문단.\n\n둘째 문단 맞는 말.";
    const d = diffParagraphs(before, after);
    expect(d[0]).toEqual({ kind: "same", text: "첫 문단." });
    expect(d[1].kind).toBe("changed");
    expect(diffSummary(d)).toEqual({ changed: 1, added: 0, removed: 1 });
  });

  it("바뀐 게 없으면 모두 같음이에요", () => {
    expect(diffSummary(diffParagraphs("가\n나", "가\n나"))).toEqual({ changed: 0, added: 0, removed: 0 });
  });
});
