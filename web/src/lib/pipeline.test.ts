import { describe, expect, it } from "vitest";
import {
  allDownstream,
  coverEstimate,
  sheetBlockers,
  restGate,
  canStart,
  inputHash,
  nextToEnqueue,
  stageStates,
  UPSTREAM,
  ALL_STAGES,
  extraGuidelineAgents,
  stagesFor,
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

  it("needs style, characters and approved sheets before art", () => {
    const latest = {
      story: a("story", "approved"),
      characters: a("characters", "approved"),
      plot: a("plot", "approved"),
      storyboard: a("storyboard", "approved"),
    };
    expect(canStart("art", latest)).toBe(false);
    expect(canStart("art", { ...latest, style: a("style", "approved") })).toBe(false);
    expect(canStart("art", { ...latest, style: a("style", "approved"), sheets: a("sheets", "approved") })).toBe(false);
    expect(
      canStart("art", { ...latest, style: a("style", "approved"), sheets: a("sheets", "approved"), research: a("research", "approved") }),
    ).toBe(true);
  });
});

describe("downstream regeneration", () => {
  it("marks everything after the story as stale when the story changes", () => {
    expect(allDownstream("story")).toEqual([
      "characters",
      "research",
      "style",
      "sheets",
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
    // 인물 승인 뒤에는 고증 자료, 고증 자료 승인 뒤에 화풍
    expect(nextToEnqueue("characters", { concept: a("concept", "approved"), story: a("story", "approved") })).toEqual(["research"]);
    expect(nextToEnqueue("research", { characters: a("characters", "approved") })).toEqual(["style"]);
    expect(nextToEnqueue("style", { characters: a("characters", "approved"), research: a("research", "approved") })).toEqual(["sheets"]);
    expect(
      nextToEnqueue("storyboard", {
        style: a("style", "approved"),
        characters: a("characters", "approved"),
        sheets: a("sheets", "approved"),
        research: a("research", "approved"),
      }),
    ).toEqual([
      "art",
    ]);
  });

  it("hashes inputs independent of order", () => {
    expect(inputHash(["b", "a"])).toBe(inputHash(["a", "b", "a"]));
    expect(inputHash(["a"])).not.toBe(inputHash(["b"]));
  });
});

describe("sheetBlockers", () => {
  it("blocks approval when a main character sheet still has a critical defect", () => {
    const body = {
      characters: [
        { id: "sunjeong", name: "순정", role: "main", defects: [{ severity: "critical" }, { severity: "minor" }] },
        { id: "suro", name: "수로", role: "main", defects: [{ severity: "major" }] },
        { id: "elder", name: "노인", role: "supporting", defects: [{ severity: "critical" }] },
      ],
    };
    expect(sheetBlockers(body)).toEqual(["순정"]);
    expect(sheetBlockers({ characters: [] })).toEqual([]);
    expect(sheetBlockers(null)).toEqual([]);
  });
});

describe("restGate", () => {
  const panels = [
    { index: 1, score: 40, passed: false },
    { index: 2, score: 55, passed: false },
    { index: 3, score: 90, passed: true },
  ];
  it("blocks the rest when no test panel passed and estimates the cost", () => {
    const g = restGate({ panels, test_panels: [1, 2], model: "fal-ai/nano-banana-pro" }, 10);
    expect(g).toEqual({ passed: 0, total: 2, estimate: 4.4, blocked: true });
  });
  it("lets the rest through when a test panel passed", () => {
    const g = restGate({ panels, test_panels: [1, 3], model: "fal-ai/nano-banana" }, 5);
    expect(g.blocked).toBe(false);
    expect(g.passed).toBe(1);
    expect(g.estimate).toBe(1.1);
  });
  it("does not block when nothing was checked yet", () => {
    expect(restGate({ panels: [{ index: 1 }], test_panels: [1] }, 3).blocked).toBe(false);
  });
});

describe("웹소설 단계 (07번)", () => {
  it("그림 단계 없이 플롯 → 집필 → 퇴고로 가요", () => {
    expect(stagesFor("novel")).toEqual(["concept", "story", "characters", "research", "plot", "manuscript", "copyedit"]);
    expect(UPSTREAM.manuscript).toEqual(["plot", "characters", "research"]);
    expect(UPSTREAM.copyedit).toEqual(["manuscript"]);
  });

  it("웹소설은 고증 승인 뒤 화풍을, 플롯 승인 뒤 콘티를 큐에 넣지 않아요", () => {
    const series = { concept: a("concept", "approved"), story: a("story", "approved"), characters: a("characters", "approved") };
    expect(nextToEnqueue("research", series, "novel")).toEqual([]);
    expect(nextToEnqueue("research", series)).toEqual(["style"]);
    const ep = { ...series, research: a("research", "approved") };
    expect(nextToEnqueue("plot", ep, "novel")).toEqual(["manuscript"]);
    expect(nextToEnqueue("plot", ep)).toEqual(["storyboard"]);
    expect(nextToEnqueue("manuscript", ep, "novel")).toEqual(["copyedit"]);
  });

  it("웹툰 단계 흐름은 그대로예요", () => {
    expect(allDownstream("plot")).toEqual(["storyboard", "art", "lettering", "review"]);
    expect(allDownstream("plot", "novel")).toEqual(["manuscript", "copyedit"]);
    expect(allDownstream("characters", "novel")).toEqual(["research", "plot", "manuscript", "copyedit"]);
  });

  it("웹소설 글 단계는 웹소설 작가 지침을 함께 읽어요", () => {
    expect(extraGuidelineAgents("story", "novel")).toEqual(["novelist"]);
    expect(extraGuidelineAgents("story")).toEqual([]);
    expect(extraGuidelineAgents("lettering")).toEqual(["translator_en"]);
  });
});

describe("coverEstimate", () => {
  it("그림 지시 한 번과 그림 장수만큼 셈해요", () => {
    expect(coverEstimate(2)).toBe(0.4); // 기본 모델 $0.15 × 2 + 지시 $0.10
    expect(coverEstimate(4, "fal-ai/nano-banana")).toBe(0.26);
    expect(coverEstimate(1, "모르는 모델")).toBe(0.25);
  });
});
