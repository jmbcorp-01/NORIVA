import { describe, expect, it } from "vitest";
import {
  allDownstream,
  canStart,
  inputHash,
  nextToEnqueue,
  stageStates,
  UPSTREAM,
  ALL_STAGES,
  type LatestArtifact,
} from "./pipeline";

const a = (stage: LatestArtifact["stage"], status: LatestArtifact["status"]): LatestArtifact => ({
  id: stage + "-1",
  stage,
  status,
});

describe("pipeline order", () => {
  it("follows 장르·소재 > 스토리 > 인물 > 화풍 > 플롯 > 콘티 > 작화 > 말풍선 > 검수", () => {
    expect(UPSTREAM.story).toEqual(["concept"]);
    expect(UPSTREAM.characters).toEqual(["story"]);
    expect(UPSTREAM.storyboard).toEqual(["plot"]);
    expect(UPSTREAM.review).toEqual(["lettering"]);
  });

  it("has no cycles: every upstream comes earlier", () => {
    for (const s of ALL_STAGES) {
      for (const u of UPSTREAM[s]) {
        expect(ALL_STAGES.indexOf(u)).toBeLessThan(ALL_STAGES.indexOf(s));
      }
    }
  });
});

describe("approval gates", () => {
  it("locks a stage until its inputs are approved", () => {
    const latest = { concept: a("concept", "pending_review") };
    expect(canStart("story", latest)).toBe(false);
    expect(stageStates(["story"], latest).story).toBe("locked");
    const approved = { concept: a("concept", "approved") };
    expect(canStart("story", approved)).toBe(true);
    expect(stageStates(["story"], approved).story).toBe("ready");
  });

  it("treats an owner-edited result as approved", () => {
    expect(canStart("story", { concept: a("concept", "edited") })).toBe(true);
  });

  it("does not start a stage that is already generating", () => {
    expect(
      canStart("story", { concept: a("concept", "approved"), story: a("story", "generating") }),
    ).toBe(false);
  });

  it("needs style and characters before art", () => {
    const latest = {
      story: a("story", "approved"),
      characters: a("characters", "approved"),
      plot: a("plot", "approved"),
      storyboard: a("storyboard", "approved"),
    };
    expect(canStart("art", latest)).toBe(false);
    expect(canStart("art", { ...latest, style: a("style", "approved") })).toBe(true);
  });
});

describe("downstream regeneration", () => {
  it("marks everything after the story as stale when the story changes", () => {
    expect(allDownstream("story")).toEqual([
      "characters",
      "style",
      "plot",
      "storyboard",
      "art",
      "lettering",
      "review",
    ]);
  });

  it("only touches lettering and review when art changes", () => {
    expect(allDownstream("art")).toEqual(["lettering", "review"]);
  });

  it("enqueues the next stage in the same scope after approval", () => {
    expect(nextToEnqueue("concept", {})).toEqual(["story"]);
    // 작품 단계 승인은 회차 단계를 자동으로 시작하지 않아요
    expect(nextToEnqueue("characters", { story: a("story", "approved") })).toEqual(["style"]);
    expect(nextToEnqueue("storyboard", { style: a("style", "approved"), characters: a("characters", "approved") })).toEqual([
      "art",
    ]);
  });

  it("hashes inputs independent of order", () => {
    expect(inputHash(["b", "a"])).toBe(inputHash(["a", "b", "a"]));
    expect(inputHash(["a"])).not.toBe(inputHash(["b"]));
  });
});
