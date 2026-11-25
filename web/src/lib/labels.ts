export const SOURCE_CATEGORY: Record<string, string> = {
  folktale: "설화·신화",
  history_event: "역사 사건",
  history_person: "역사 인물",
  folk_belief: "민속 신앙",
  creature: "요괴·신",
  place: "장소",
  custom: "풍속",
};

export const AGENT_LABEL: Record<string, string> = {
  planner: "기획",
  story: "스토리",
  character: "캐릭터",
  art_director: "작화 디렉터",
  storyboard: "콘티",
  artist: "작화",
  letterer: "레터링",
  translator_en: "영어 대사",
  reviewer: "검수",
  novelist: "웹소설 작가",
  copyeditor: "퇴고·교정",
};

export const SCOPE_LABEL: Record<string, string> = {
  global: "전체",
  genre: "장르",
  series: "작품",
  episode: "회차",
};

// docs/02-content-story-guideline.md 2장
export const GENRES = ["오컬트·호러", "사극 로맨스", "회귀·빙의 사극", "무협·액션", "현대 판타지", "미스터리·스릴러", "코믹"];

export const AGE_RATING: Record<string, string> = { all: "전체", "12": "12세", "15": "15세", "18": "18세" };

export const SERIES_STATUS: Record<string, string> = {
  planning: "기획",
  production: "제작",
  serializing: "연재 중",
  hiatus: "휴재",
  completed: "완결",
};

export const JOB_STATUS: Record<string, string> = {
  queued: "대기",
  running: "실행 중",
  done: "완료",
  failed: "실패",
  canceled: "취소",
};
