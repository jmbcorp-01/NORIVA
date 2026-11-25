import { describe, expect, it } from "vitest";
import { funnel } from "./reader-funnel";

describe("reader funnel", () => {
  it("counts finishers and the panel where most readers stopped", () => {
    const f = funnel([
      { maxPanel: 50, panelCount: 50 },
      { maxPanel: 12, panelCount: 50 },
      { maxPanel: 12, panelCount: 50 },
      { maxPanel: 30, panelCount: 50 },
    ]);
    expect(f).toEqual({ readers: 4, finished: 1, completion: 25, topDrop: { panel: 12, readers: 2 } });
  });

  it("is empty without readers", () => {
    expect(funnel([])).toEqual({ readers: 0, finished: 0, completion: 0, topDrop: null });
  });
});
