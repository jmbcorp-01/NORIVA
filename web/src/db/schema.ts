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

/* ─── 제작 파이프라인 (03번) ─── */

export const stage = pgEnum("stage", [
  // 작품 단위
  "concept", // ① 장르·소재 → 기획안
  "story", // ② 스토리
  "characters", // ③ 인물
  "style", // ④ 화풍
  // 회차 단위
  "plot", // ⑤ 회차 플롯(대본)
  "storyboard", // ⑥ 콘티
  "art", // ⑦ 작화
  "lettering", // ⑧ 말풍선
  "review", // ⑨ 검수
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

export const jobStatus = pgEnum("job_status", ["queued", "running", "done", "failed", "canceled"]);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: stage("type").notNull(),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    episodeId: uuid("episode_id").references(() => episodes.id, { onDelete: "cascade" }),
    artifactId: uuid("artifact_id").references(() => artifacts.id, { onDelete: "set null" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: jobStatus("status").notNull().default("queued"),
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
