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

/** 단계 카드의 도움말: AI가 하는 일, 대표가 볼 것, 승인 기준 (docs/03-agent-pipeline.md 2절) */
export const STAGE_HELP: Record<Stage, { ai: string; look: string; approve: string }> = {
  concept: {
    ai: "고른 소재와 장르, 메모를 보고 기획안 3개를 써요. 제목, 로그라인, 뿌리를 쓰는 방식, 세계 규칙, 시즌 1 줄거리, 기존 작품과 겹치는지 점검한 결과가 들어 있어요.",
    look: "소재를 빼면 이야기가 무너지는지(R-2), 유명 작품과 겹치지 않는지(R-6), 첫 화가 바로 궁금한지 보세요.",
    approve: "마음에 드는 안 하나를 골라 '직접 고치기'로 다듬은 뒤 승인해요. 섞고 싶으면 'A안 설정에 C안 주인공'처럼 지시를 적어 다시 생성해요.",
  },
  story: {
    ai: "확정된 기획안으로 시놉시스, 시즌 아크, 회차별 한 줄 요약 30~50개, 떡밥 장부, 회차 끝 절단 배치를 만들어요.",
    look: "1~3화에 훅이 있는지, 답답한 전개가 2화 넘게 이어지지 않는지, 심은 떡밥에 회수 계획이 있는지 보세요.",
    approve: "전체 줄기가 맞으면 승인해요. 회차 순서만 바꾸려면 직접 고치기가 빨라요.",
  },
  characters: {
    ai: "인물마다 결핍, 원하는 것, 말투, 호칭 관계, 시대에 맞는 이름, 외모 명세를 써요.",
    look: "대사만 읽어도 누가 말하는지 구분되는지, 이름과 복식이 시대에 맞는지 보세요.",
    approve: "인물을 고치면 스토리의 이름·관계도 다시 맞춰야 할 수 있어요. 승인하면 화풍 단계가 열려요.",
  },
  style: {
    ai: "기획안의 톤과 소재의 시각 요소로 화풍 후보 3개를 만들어요. 선, 채색, 명암, 팔레트, 배경 처리, 금지 요소가 화풍 카드에 들어가요.",
    look: "작품 분위기와 맞는지, 일본·중국풍이 섞이지 않았는지(R-5) 보세요.",
    approve: "하나를 골라 승인하면 회차 제작을 시작할 수 있어요.",
  },
  plot: {
    ai: "설정집과 이전 회차 대본을 읽고 이번 회차의 전개 설계표(훅, 박자, 절단, 떡밥)와 장면별 대본을 써요.",
    look: "앞 회차와 설정이 어긋나지 않는지, 대사가 말풍선에 들어갈 길이인지, 금지 표현이 없는지 보세요.",
    approve: "대사는 직접 고치기로 바로 다듬을 수 있어요. 고친 내용은 제작 원장에 남아요.",
  },
  storyboard: {
    ai: "확정 대본을 컷으로 나눠요. 컷마다 샷 크기, 각도, 세로 길이, 인물 위치, 표정, 대사, 효과음, 그림 지시문이 들어가요.",
    look: "같은 샷이 3번 연속되지 않는지, 스크롤을 내리며 드러나는 장면이 있는지, 컷 수가 적당한지 보세요.",
    approve: "승인하면 작화가 컷마다 이 지시문대로 그려요. 여기서 고치는 게 그림을 다시 그리는 것보다 싸요.",
  },
  art: {
    ai: "컷마다 후보를 그리고 자동 결함 검사로 가장 좋은 그림을 골라요. 기준에 못 미치면 지시문을 고쳐 다시 그려요.",
    look: "'확인 필요' 표시가 붙은 컷, 인물 얼굴과 의상이 시트와 같은지, 손·글자 같은 결함이 없는지 보세요.",
    approve: "마음에 안 드는 컷만 골라 다시 그릴 수 있어요. 비용이 가장 많이 드는 단계예요.",
  },
  lettering: {
    ai: "얼굴과 손을 가리지 않게 말풍선 위치를 정하고 한국어·영어 대사와 효과음을 배치해요. 글자는 그림에 굽지 않아요.",
    look: "읽는 순서가 자연스러운지, 영어 대사가 말풍선 밖으로 넘치지 않는지 보세요.",
    approve: "자동 검사를 통과하면 검수 단계로 넘어가요.",
  },
  review: {
    ai: "고정 채점표로 회차 점수를 매기고 고칠 점을 정리해요. 수정은 최대 2라운드예요.",
    look: "실제 독자 화면처럼 한국어·영어로 한 번씩 읽어 보세요.",
    approve: "최종 승인하면 회차를 공개 예약할 수 있어요. 반려하면 어느 단계로 돌려보낼지 고를 수 있어요.",
  },
};

/** 작품 밖에서 도는 작업 (작업 큐 표시용) */
export type JobType = Stage | "scout" | "source_fill" | "series_meta" | "episode_meta" | "style_scout";
export const JOB_LABEL: Record<JobType, string> = {
  ...Object.fromEntries(Object.entries(STAGE_INFO).map(([k, v]) => [k, `${v.no} ${v.label}`])),
  scout: "소재 발굴 (시장 분석)",
  source_fill: "소재 AI로 채우기",
  series_meta: "연재 설정 AI로 채우기",
  episode_meta: "회차 제목 가져오기",
  style_scout: "어울리는 웹툰 화풍 찾기",
} as Record<JobType, string>;

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

/** 작화 모델 비교 시험에 쓰는 그림 모델. 작업 서버 images.IMAGE_MODELS와 같아야 해요. 가격은 어림값이에요. */
export const IMAGE_MODELS = [
  { id: "fal-ai/nano-banana", label: "Nano Banana (기본)", price: 0.04 },
  { id: "fal-ai/nano-banana-pro", label: "Nano Banana Pro", price: 0.15 },
  { id: "fal-ai/bytedance/seedream/v4", label: "Seedream 4", price: 0.03 },
] as const;
export const imageModelLabel = (id?: string | null) => IMAGE_MODELS.find((m) => m.id === id)?.label ?? "기본 모델";
