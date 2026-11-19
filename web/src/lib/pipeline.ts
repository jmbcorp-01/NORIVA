// 제작 파이프라인 규칙 (docs/03-agent-pipeline.md). DB와 화면에 의존하지 않는 순수 함수만 둬요.
import { createHash } from "node:crypto";

export type Stage =
  | "concept"
  | "story"
  | "characters"
  | "style"
  | "plot"
  | "storyboard"
  | "art"
  | "lettering"
  | "review";

export type ArtifactStatus =
  | "generating"
  | "pending_review"
  | "approved"
  | "rejected"
  | "edited"
  | "stale"
  | "failed";

export const SERIES_STAGES: Stage[] = ["concept", "story", "characters", "style"];
export const EPISODE_STAGES: Stage[] = ["plot", "storyboard", "art", "lettering", "review"];
export const ALL_STAGES: Stage[] = [...SERIES_STAGES, ...EPISODE_STAGES];

export const STAGE_INFO: Record<Stage, { no: string; label: string; agent: string; desc: string }> = {
  concept: { no: "①", label: "장르·소재", agent: "planner", desc: "뿌리를 연결한 기획안 3개" },
  story: { no: "②", label: "스토리", agent: "story", desc: "시놉시스, 시즌 아크, 회차 요약, 떡밥 장부" },
  characters: { no: "③", label: "인물", agent: "character", desc: "인물 설정과 캐릭터 시트" },
  style: { no: "④", label: "화풍", agent: "art_director", desc: "화풍 카드와 시험 컷" },
  plot: { no: "⑤", label: "회차 플롯", agent: "story", desc: "전개 설계표와 대본" },
  storyboard: { no: "⑥", label: "콘티", agent: "storyboard", desc: "컷 구성 2~3안" },
  art: { no: "⑦", label: "작화", agent: "artist", desc: "컷 그림, 자동 결함 검사" },
  lettering: { no: "⑧", label: "말풍선", agent: "letterer", desc: "한국어·영어 말풍선과 효과음" },
  review: { no: "⑨", label: "검수", agent: "reviewer", desc: "고정 채점표, 최종 승인" },
};

/** 단계마다 함께 읽는 다른 에이전트의 지침 (말풍선은 영어 대사 지침도 따라요) */
export const EXTRA_GUIDELINE_AGENTS: Partial<Record<Stage, string[]>> = {
  lettering: ["translator_en"],
};

/** 각 단계가 입력으로 쓰는 앞 단계 (승인된 결과물이 있어야 시작 가능) */
export const UPSTREAM: Record<Stage, Stage[]> = {
  concept: [],
  story: ["concept"],
  characters: ["story"],
  style: ["characters"],
  plot: ["story", "characters"],
  storyboard: ["plot"],
  art: ["storyboard", "style", "characters"],
  lettering: ["art", "plot"],
  review: ["lettering"],
};

export function isSeriesStage(stage: Stage): boolean {
  return SERIES_STAGES.includes(stage);
}

/** 이 단계를 입력으로 쓰는 단계들 (직접) */
export function directDownstream(stage: Stage): Stage[] {
  return ALL_STAGES.filter((s) => UPSTREAM[s].includes(stage));
}

/** 이 단계가 바뀌면 낡음 표시해야 하는 모든 뒤 단계 (간접 포함, 파이프라인 순서) */
export function allDownstream(stage: Stage): Stage[] {
  const out = new Set<Stage>();
  const walk = (s: Stage) => {
    for (const d of directDownstream(s)) {
      if (!out.has(d)) {
        out.add(d);
        walk(d);
      }
    }
  };
  walk(stage);
  return ALL_STAGES.filter((s) => out.has(s));
}

/** 입력 결과물들의 지문. 순서와 상관없이 같은 입력이면 같은 값 */
export function inputHash(artifactIds: string[]): string {
  const sorted = [...new Set(artifactIds)].sort();
  return createHash("sha256").update(sorted.join("|")).digest("hex").slice(0, 16);
}

export type LatestArtifact = { id: string; stage: Stage; status: ArtifactStatus };

export type StageState =
  | "locked" // 앞 단계가 승인되지 않음
  | "ready" // 시작할 수 있음
  | "generating"
  | "pending_review"
  | "approved"
  | "stale"
  | "rejected"
  | "failed";

export function isApproved(a?: LatestArtifact): boolean {
  return !!a && (a.status === "approved" || a.status === "edited");
}

/**
 * 단계별 화면 상태. latest는 단계마다 가장 최근 결과물.
 * 작품 단계와 회차 단계를 함께 넘기면 회차 단계의 잠금까지 계산해요.
 */
export function stageStates(
  stages: Stage[],
  latest: Partial<Record<Stage, LatestArtifact>>,
): Record<Stage, StageState> {
  const result = {} as Record<Stage, StageState>;
  for (const s of stages) {
    const a = latest[s];
    const upstreamOk = UPSTREAM[s].every((u) => isApproved(latest[u]));
    if (!a) {
      result[s] = upstreamOk ? "ready" : "locked";
      continue;
    }
    if (a.status === "edited") result[s] = "approved";
    else result[s] = a.status;
  }
  return result;
}

export function canStart(stage: Stage, latest: Partial<Record<Stage, LatestArtifact>>): boolean {
  const a = latest[stage];
  if (a?.status === "generating") return false;
  return UPSTREAM[stage].every((u) => isApproved(latest[u]));
}

export function canApprove(a?: LatestArtifact): boolean {
  return !!a && (a.status === "pending_review" || a.status === "stale");
}

/** 승인 후 자동으로 큐에 넣을 다음 단계 (같은 범위 안에서, 입력이 모두 승인된 것만) */
export function nextToEnqueue(
  approvedStage: Stage,
  latest: Partial<Record<Stage, LatestArtifact>>,
): Stage[] {
  const scope = isSeriesStage(approvedStage) ? SERIES_STAGES : EPISODE_STAGES;
  return directDownstream(approvedStage).filter(
    (d) =>
      scope.includes(d) &&
      !latest[d] &&
      UPSTREAM[d].every((u) => u === approvedStage || isApproved(latest[u])),
  );
}

export const STATE_LABEL: Record<StageState, string> = {
  locked: "대기",
  ready: "시작 가능",
  generating: "생성 중",
  pending_review: "검토 대기",
  approved: "승인",
  stale: "낡음",
  rejected: "반려",
  failed: "실패",
};
