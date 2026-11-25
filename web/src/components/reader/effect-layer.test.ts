import { describe, expect, it } from "vitest";
import { effectLines } from "./effect-layer";

describe("효과 레이어", () => {
  it("같은 컷은 늘 같은 모양, 집중선은 가운데를 비워요", () => {
    expect(effectLines("focus", 3)).toEqual(effectLines("focus", 3));
    expect(effectLines("focus", 3)).not.toEqual(effectLines("focus", 4));
    for (const l of effectLines("focus", 3)) expect(Math.hypot(l.x2 - 50, l.y2 - 50)).toBeGreaterThanOrEqual(29);
    expect(effectLines("speed", 1).every((l) => l.y1 === l.y2)).toBe(true);
  });
});
