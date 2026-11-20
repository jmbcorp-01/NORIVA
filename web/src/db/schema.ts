import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  boolean,
  numeric,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─── 소재 라이브러리 (02번 지침 1.1) ─── */

export const sourceCategory = pgEnum("source_category", [
  "folktale", // 설화·신화
  "history_event", // 역사 사건
  "history_person", // 역사 인물
  "folk_belief", // 민속 신앙
  "creature", // 요괴·신
  "place", // 장소
  "custom", // 풍속
]);

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  category: sourceCategory("category").notNull(),
  era: text("era").notNull().default(""),
  summary: text("summary").notNull().default(""),
  rules: jsonb("rules").$type<string[]>().notNull().default([]),
  visualNotes: text("visual_notes").notNull().default(""),
  references: jsonb("references").$type<string[]>().notNull().default([]),
  caution: text("caution").notNull().default(""),
  overlapWorks: jsonb("overlap_works").$type<string[]>().notNull().default([]),
  ...ts(),
});

/* ─── 지침 (03번 5절): 전체 < 장르 < 작품 < 회차 ─── */

export const guidelineScope = pgEnum("guideline_scope", ["global", "genre", "series", "episode"]);

export const agentKind = pgEnum("agent_kind", [
  "planner", // 기획
  "story", // 스토리
  "character", // 캐릭터
  "art_director", // 작화 디렉터
  "storyboard", // 콘티
  "artist", // 작화
  "letterer", // 레터링
  "translator_en", // 영어 대사
  "reviewer", // 검수
]);

export type GuidelineRule = { code: string; text: string };
export type GuidelineBody = {
  role: string;
  rules: GuidelineRule[];
  banned: string[];
  outputFormat: string;
  examples: string;
};

export const guidelines = pgTable(
  "guidelines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: guidelineScope("scope").notNull(),
    scopeRef: text("scope_ref").notNull().default(""), // 장르 이름, 작품 id, 회차 id
    agent: agentKind("agent").notNull(),
    title: text("title").notNull(),
    currentVersion: integer("current_version").notNull().default(1),
    ...ts(),
  },
  (t) => [uniqueIndex("guidelines_scope_agent").on(t.scope, t.scopeRef, t.agent)],
);

export const guidelineVersions = pgTable(
  "guideline_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guidelineId: uuid("guideline_id")
      .notNull()
      .references(() => guidelines.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    body: jsonb("body").$type<GuidelineBody>().notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("guideline_versions_gv").on(t.guidelineId, t.version)],
);

/* ─── 작품 ─── */

export const seriesStatus = pgEnum("series_status", [
  "planning",
  "production",
  "serializing",
  "hiatus",
  "completed",
]);

export type SeriesBrief = {
  tone: string;
  ageRating: "all" | "12" | "15" | "18";
  audience: string;
  memo: string;
  /** 작화에 쓸 그림 모델 (모델 비교 시험에서 대표가 고름). 없으면 작업 서버 기본값 */
  imageModel?: string;
  /** 대표가 올린 참고 웹툰 캡처 (비공개 저장소 키). ④ 화풍에서 기준 값 분석에만 써요 */
  styleRefs?: string[];
  /** ④+ 인물 시트를 그릴 때 참조로 넣는 고증 참고 그림 (비공개 보관, S3 키). 유물·복식 사진 등 */
  historyRefs?: string[];
  /** 회차 하나에 쓸 수 있는 제작비 상한 (달러). 넘으면 그 회차의 새 작업을 시작하지 않아요. 없으면 40 */
  episodeBudgetUsd?: number;
  /** AI가 ①~③에 맞춰 찾은 시장 웹툰과 화풍 특징. 특징만 화풍 후보에 쓰고 이름·그림은 그림 모델에 보내지 않아요 */
  styleSuggestions?: { at: string; works: StyleWork[] };
  /** styleSuggestions.works 중 대표가 고른 번호 (최대 3개) */
  styleChoice?: number[];
};

export type StyleWork = {
  title: string;
  platform: string;
  author: string;
  url: string;
  why: string;
  traits: Record<string, string | number>;
  /** true면 공식 대표 이미지를 AI가 직접 보고 잰 값, false면 글로 추정한 값 */
  measured?: boolean;
};

export const series = pgTable("series", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  titleEn: text("title_en").notNull().default(""),
  genre: text("genre").notNull(),
  status: seriesStatus("status").notNull().default("planning"),
  brief: jsonb("brief").$type<SeriesBrief>().notNull(),
  logline: text("logline").notNull().default(""),
  rootNote: text("root_note").notNull().default(""),
  coverUrl: text("cover_url").notNull().default(""),
  // 독자 화면용 공개 정보 (한국어·영어)
  loglineEn: text("logline_en").notNull().default(""),
  rootNoteEn: text("root_note_en").notNull().default(""),
  // 연재 요일: mon, tue, ... sun
  scheduleDays: jsonb("schedule_days").$type<string[]>().notNull().default([]),
  // 작화·회차 플롯 등 게이트를 자동 승인으로 바꿀 단계 목록
  autoApprove: jsonb("auto_approve").$type<string[]>().notNull().default([]),
  ...ts(),
});

export const seriesSources = pgTable(
  "series_sources",
  {
    seriesId: uuid("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    role: text("role").notNull().default("engine"), // engine | motif | setting
  },
  (t) => [primaryKey({ columns: [t.seriesId, t.sourceId] })],
);

export const episodeStatus = pgEnum("episode_status", [
  "draft",
  "review",
  "approved",
  "scheduled",
  "published",
]);

export const episodes = pgTable(
  "episodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull().default(""),
    titleEn: text("title_en").notNull().default(""),
    logline: text("logline").notNull().default(""),
    status: episodeStatus("status").notNull().default("draft"),
    publishAt: timestamp("publish_at", { withTimezone: true }),
    ...ts(),
  },
  (t) => [uniqueIndex("episodes_series_number").on(t.seriesId, t.number)],
);

/** 독자에게 보여주는 회차 공개본. 검수를 통과한 말풍선 결과를 언어별로 굳혀 둬요. */
export type PublishedBubble = {
  shape: "speech" | "thought" | "shout" | "whisper" | "narration";
  text: string;
  box: { x: number; y: number; w: number; h: number };
  tail: { x: number; y: number } | null;
};
export type PublishedPanel = {
  index: number;
  image: string; // 미디어 키
  gapBefore: "none" | "normal" | "long";
  bubbles: PublishedBubble[];
  sfx: { text: string; x: number; y: number; size: number; angle: number } | null;
};

export const episodeAssets = pgTable(
  "episode_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(), // ko | en
    panels: jsonb("panels").$type<PublishedPanel[]>().notNull(),
    sourceArtifactId: uuid("source_artifact_id"),
    ...ts(),
  },
  (t) => [uniqueIndex("episode_assets_episode_locale").on(t.episodeId, t.locale)],
);

/* ─── 제작 파이프라인 (03번) ─── */

export const stage = pgEnum("stage", [
  // 작품 단위
  "concept", // ① 장르·소재 → 기획안
  "story", // ② 스토리
  "characters", // ③ 인물
  "research", // ③+ 고증 자료 (옷·머리·무기·건물의 시대 고증과 실물 사진)
  "style", // ④ 화풍
  "sheets", // ④+ 인물 시트 (작품 전체가 쓰는 설정화)
  // 회차 단위
  "plot", // ⑤ 회차 플롯(대본)
  "storyboard", // ⑥ 콘티
  "art", // ⑦ 작화
  "lettering", // ⑧ 말풍선
  "review", // ⑨ 검수
  // 작품 밖 작업 (작품 없이 돌아요, jobs.type에만 써요)
  "scout", // 시장 분석 소재 발굴
  "source_fill", // 소재 이름만 보고 나머지 칸 채우기
  "series_meta", // 승인한 기획·스토리·인물로 연재 설정(제목, 소개, 뿌리 노트) 채우기
  "episode_meta", // 승인한 스토리의 회차 요약으로 회차 제목(한·영)과 한 줄 요약 채우기
  "style_scout", // 승인한 기획·스토리·인물에 맞는 시장 웹툰을 찾아 화풍 특징 정리 (④ 화풍 참고)
]);

export const artifactStatus = pgEnum("artifact_status", [
  "generating",
  "pending_review",
  "approved",
  "rejected",
  "edited",
  "stale",
  "failed",
]);

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    episodeId: uuid("episode_id").references(() => episodes.id, { onDelete: "cascade" }),
    stage: stage("stage").notNull(),
    attempt: integer("attempt").notNull().default(1),
    status: artifactStatus("status").notNull().default("generating"),
    body: jsonb("body").$type<Record<string, unknown>>().notNull().default({}),
    // 이 결과를 만든 입력(앞 단계 승인 결과물들)의 지문. 03번 4절
    inputHash: text("input_hash").notNull().default(""),
    inputArtifactIds: jsonb("input_artifact_ids").$type<string[]>().notNull().default([]),
    guidelineVersionIds: jsonb("guideline_version_ids").$type<string[]>().notNull().default([]),
    ownerNote: text("owner_note").notNull().default(""),
    ...ts(),
  },
  (t) => [index("artifacts_scope").on(t.seriesId, t.episodeId, t.stage)],
);

export type JobProgress = { step: string; done?: number; total?: number; at: string };

export const jobStatus = pgEnum("job_status", ["queued", "running", "done", "failed", "canceled"]);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: stage("type").notNull(),
    // 소재 발굴처럼 작품과 상관없는 작업은 비어 있어요
    seriesId: uuid("series_id").references(() => series.id, { onDelete: "cascade" }),
    episodeId: uuid("episode_id").references(() => episodes.id, { onDelete: "cascade" }),
    artifactId: uuid("artifact_id").references(() => artifacts.id, { onDelete: "set null" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: jobStatus("status").notNull().default("queued"),
    // 실행 중 진행 상황 (작업 서버가 갱신): 단계 이름, 끝난 수 / 전체 수
    progress: jsonb("progress").$type<JobProgress | null>(),
    attempts: integer("attempts").notNull().default(0),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lockedBy: text("locked_by"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...ts(),
  },
  (t) => [index("jobs_status_run_after").on(t.status, t.runAfter)],
);

/* ─── 소재 발굴 (시장 분석 → 소재 후보) ─── */

export const scoutRunStatus = pgEnum("scout_run_status", ["running", "done", "failed"]);

export type MarketReport = {
  summary: string;
  trends: { title: string; detail: string; region: "kr" | "global" | "both" }[];
  hits: { title: string; platform: string; why: string }[];
  /** 지난 실행 대비 바뀐 점 */
  changes: string;
  links: { title: string; url: string }[];
};

export const scoutRuns = pgTable("scout_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
  trigger: text("trigger").notNull().default("manual"), // manual | weekly
  focus: text("focus").notNull().default(""),
  status: scoutRunStatus("status").notNull().default("running"),
  report: jsonb("report").$type<MarketReport | null>(),
  error: text("error"),
  ...ts(),
});

export const candidateStatus = pgEnum("candidate_status", ["pending", "adopted", "dismissed"]);

export type CandidateBody = {
  name: string;
  category: (typeof sourceCategory.enumValues)[number];
  era: string;
  summary: string;
  rules: string[];
  visualNotes: string;
  references: string[];
  caution: string;
  overlapWorks: string[];
  whyNow: string;
  evidence: { claim: string; url: string }[];
  similarHits: string[];
  difference: string;
  loglines: string[];
  combo: string;
  genre: string;
  globalAppeal: number;
  score: number;
  factCheck: string[];
};

export const sourceCandidates = pgTable(
  "source_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => scoutRuns.id, { onDelete: "cascade" }),
    status: candidateStatus("status").notNull().default("pending"),
    body: jsonb("body").$type<CandidateBody>().notNull(),
    dismissReason: text("dismiss_reason").notNull().default(""),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    ...ts(),
  },
  (t) => [index("source_candidates_status").on(t.status, t.createdAt)],
);

export const costLedger = pgTable("cost_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  seriesId: uuid("series_id").references(() => series.id, { onDelete: "set null" }),
  episodeId: uuid("episode_id").references(() => episodes.id, { onDelete: "set null" }),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  units: jsonb("units").$type<Record<string, number>>().notNull().default({}),
  costUsd: numeric("cost_usd", { precision: 10, scale: 4 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 대표의 선택·수정·승인 기록. 저작권 기여 증거 (01번 9절)
export const decisionLedger = pgTable("decision_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  artifactId: uuid("artifact_id").references(() => artifacts.id, { onDelete: "set null" }),
  seriesId: uuid("series_id").references(() => series.id, { onDelete: "set null" }),
  actor: text("actor").notNull(),
  action: text("action").notNull(), // approve | reject | edit | regenerate | override | restore_guideline
  before: jsonb("before"),
  after: jsonb("after"),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bannedTerms = pgTable("banned_terms", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(), // dialogue_ko | dialogue_en | visual
  term: text("term").notNull(),
  hint: text("hint").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─── 독자 회원 (05번 3.1) ─── */

export const readers = pgTable("readers", {
  id: uuid("id").primaryKey().defaultRandom(),
  nickname: text("nickname").notNull(),
  email: text("email"),
  locale: text("locale").notNull().default("ko"),
  // 올리면 이전에 발급한 로그인이 모두 끊겨요 (전체 로그아웃, 탈퇴)
  sessionVersion: integer("session_version").notNull().default(1),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ...ts(),
});

export const readerIdentities = pgTable(
  "reader_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    readerId: uuid("reader_id")
      .notNull()
      .references(() => readers.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // kakao | naver | google | apple | dev
    providerUserId: text("provider_user_id").notNull(),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reader_identities_provider_user").on(t.provider, t.providerUserId)],
);

export const bookmarks = pgTable(
  "bookmarks",
  {
    readerId: uuid("reader_id")
      .notNull()
      .references(() => readers.id, { onDelete: "cascade" }),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.readerId, t.seriesId] })],
);

/** 어디까지 봤는지. 이어보기와 내 서재, 이탈 컷 분석에 써요. */
export const readingProgress = pgTable(
  "reading_progress",
  {
    readerId: uuid("reader_id")
      .notNull()
      .references(() => readers.id, { onDelete: "cascade" }),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    maxPanel: integer("max_panel").notNull().default(0),
    panelCount: integer("panel_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.readerId, t.episodeId] }), index("reading_progress_reader_updated").on(t.readerId, t.updatedAt)],
);
