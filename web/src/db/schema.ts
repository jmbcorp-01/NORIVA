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
  /** 대표가 직접 그렸거나 권리를 가진 그림 (비공개 저장소 키, 3장까지). 그림 모델이 직접 보고 따라 그려요 */
  ownArt?: string[];
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
  // 독자 화면 판매 설정. paid가 false면 모든 회차 무료 (오픈 베타)
  paid: boolean("paid").notNull().default(false),
  freeEpisodes: integer("free_episodes").notNull().default(3),
  waitFree: boolean("wait_free").notNull().default(true),
  // 스튜디오 '더미 채우기'로 만든 IR용 샘플 작품. '더미 모두 삭제'가 이 표시만 보고 지워요
  isDummy: boolean("is_dummy").notNull().default(false),
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
    // 유료 작품에서 이 회차를 소장하는 값 (코인). 선공개 회차는 기다무로 열 수 없어요
    priceCoins: integer("price_coins").notNull().default(3),
    earlyAccess: boolean("early_access").notNull().default(false),
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
  /** 이어지는 긴 세로 컷: 이 컷 위쪽 overlap(높이 비율)만큼이 앞 컷 아래에 겹쳐요. margin은 겹치는 길이(가로 폭 대비 %) */
  join?: { overlap: number; margin: number };
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
  // 회차 열기 시트에서 '다음부터 묻지 않고 바로 열기'를 골랐는지
  autoUnlock: boolean("auto_unlock").notNull().default(false),
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

/* ─── 판매: 코인, 회차 열기, 패스 (01번 4절, 05번 3절) ─── */

/** 코인 충전 상품. 스튜디오에서 등록·수정·삭제해요. 스토어 상품 ID는 App Store Connect·Play Console에 만든 ID와 같게 적어요. */
export const coinProducts = pgTable("coin_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  coins: integer("coins").notNull(),
  bonusCoins: integer("bonus_coins").notNull().default(0),
  priceKrw: integer("price_krw").notNull(),
  appleProductId: text("apple_product_id").notNull().default(""),
  googleProductId: text("google_product_id").notNull().default(""),
  badge: text("badge").notNull().default(""),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...ts(),
});

/** 독자 코인 잔액. 충전 코인(paid)과 보너스 코인(free)을 나눠 두고 보너스부터 써요. */
export const coinWallets = pgTable("coin_wallets", {
  readerId: uuid("reader_id")
    .primaryKey()
    .references(() => readers.id, { onDelete: "cascade" }),
  paid: integer("paid").notNull().default(0),
  free: integer("free").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 코인 장부: 잔액이 바뀔 때마다 한 줄. 같은 요청 키는 한 번만 들어가요 (두 번 눌러도 한 번만 처리). */
export const coinTransactions = pgTable(
  "coin_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    readerId: uuid("reader_id")
      .notNull()
      .references(() => readers.id, { onDelete: "cascade" }),
    deltaPaid: integer("delta_paid").notNull().default(0),
    deltaFree: integer("delta_free").notNull().default(0),
    reason: text("reason").notNull(), // charge | unlock | refund | event | expire
    refId: text("ref_id"),
    balanceAfter: integer("balance_after").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("coin_transactions_idem").on(t.readerId, t.idempotencyKey), index("coin_transactions_reader_at").on(t.readerId, t.createdAt)],
);

/** 결제 기록. 탈퇴해도 법정 보관 기간(5년) 동안 남겨야 해서 독자와 끊어도 지우지 않아요. */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    readerId: uuid("reader_id").references(() => readers.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // coin | pass
    productId: text("product_id").notNull(),
    amountKrw: integer("amount_krw").notNull(),
    store: text("store").notNull(), // test | app_store | play | web
    storeTransactionId: text("store_transaction_id").notNull(),
    status: text("status").notNull(), // paid | refunded | failed
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
    ...ts(),
  },
  (t) => [uniqueIndex("payments_store_tx").on(t.store, t.storeTransactionId)],
);

/** 독자가 연 회차 (영구 소장 또는 기다무·패스로 한 번 열람) */
export const episodeUnlocks = pgTable(
  "episode_unlocks",
  {
    readerId: uuid("reader_id")
      .notNull()
      .references(() => readers.id, { onDelete: "cascade" }),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    method: text("method").notNull(), // coin | wait_free | event
    coinsSpent: integer("coins_spent").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.readerId, t.episodeId] })],
);

/** 기다리면 무료: 작품마다 다음 무료 회차를 열 수 있는 시각 */
export const waitFreeTimers = pgTable(
  "wait_free_timers",
  {
    readerId: uuid("reader_id")
      .notNull()
      .references(() => readers.id, { onDelete: "cascade" }),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    nextAt: timestamp("next_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.readerId, t.seriesId] })],
);

/** NORIVA 패스 (월 구독) */
export const subscriptions = pgTable("subscriptions", {
  readerId: uuid("reader_id")
    .primaryKey()
    .references(() => readers.id, { onDelete: "cascade" }),
  store: text("store").notNull(), // test | app_store | play | web
  status: text("status").notNull(), // active | canceled | expired
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...ts(),
});

/** 회차 반응: 재미있어(fun) / 아쉬워(meh). 댓글은 운영하면서 넣어요. */
export const episodeReactions = pgTable(
  "episode_reactions",
  {
    readerId: uuid("reader_id")
      .notNull()
      .references(() => readers.id, { onDelete: "cascade" }),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // fun | meh
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.readerId, t.episodeId] }), index("episode_reactions_episode").on(t.episodeId)],
);

/** 회차 조회 (이번 주 순위). 로그인하지 않은 독자도 세요. */
export const viewEvents = pgTable(
  "view_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    readerId: uuid("reader_id").references(() => readers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("view_events_at").on(t.createdAt, t.seriesId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    readerId: uuid("reader_id")
      .notNull()
      .references(() => readers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // new_episode | wait_free | notice
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    href: text("href").notNull().default(""),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_reader_at").on(t.readerId, t.createdAt)],
);

export const notificationPrefs = pgTable("notification_prefs", {
  readerId: uuid("reader_id")
    .primaryKey()
    .references(() => readers.id, { onDelete: "cascade" }),
  newEpisode: boolean("new_episode").notNull().default(true),
  waitFree: boolean("wait_free").notNull().default(true),
  events: boolean("events").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 스튜디오 설정 값 (대표 2단계 인증 비밀 키 등) */
export const studioSettings = pgTable("studio_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 요청 횟수 제한 (로그인, 회차 열기, 충전). 서버가 여러 대여도 같이 세요. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
});
