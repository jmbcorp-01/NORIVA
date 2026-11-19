CREATE TYPE "public"."agent_kind" AS ENUM('planner', 'story', 'character', 'art_director', 'storyboard', 'artist', 'letterer', 'translator_en', 'reviewer');--> statement-breakpoint
CREATE TYPE "public"."artifact_status" AS ENUM('generating', 'pending_review', 'approved', 'rejected', 'edited', 'stale', 'failed');--> statement-breakpoint
CREATE TYPE "public"."episode_status" AS ENUM('draft', 'review', 'approved', 'scheduled', 'published');--> statement-breakpoint
CREATE TYPE "public"."guideline_scope" AS ENUM('global', 'genre', 'series', 'episode');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'done', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."series_status" AS ENUM('planning', 'production', 'serializing', 'hiatus', 'completed');--> statement-breakpoint
CREATE TYPE "public"."source_category" AS ENUM('folktale', 'history_event', 'history_person', 'folk_belief', 'creature', 'place', 'custom');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('concept', 'story', 'characters', 'style', 'plot', 'storyboard', 'art', 'lettering', 'review');--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" uuid NOT NULL,
	"episode_id" uuid,
	"stage" "stage" NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" "artifact_status" DEFAULT 'generating' NOT NULL,
	"body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_hash" text DEFAULT '' NOT NULL,
	"input_artifact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"guideline_version_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"owner_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "banned_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"term" text NOT NULL,
	"hint" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" uuid,
	"episode_id" uuid,
	"job_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"units" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_usd" numeric(10, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid,
	"series_id" uuid,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"title_en" text DEFAULT '' NOT NULL,
	"logline" text DEFAULT '' NOT NULL,
	"status" "episode_status" DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guideline_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guideline_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"body" jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guidelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "guideline_scope" NOT NULL,
	"scope_ref" text DEFAULT '' NOT NULL,
	"agent" "agent_kind" NOT NULL,
	"title" text NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "stage" NOT NULL,
	"series_id" uuid NOT NULL,
	"episode_id" uuid,
	"artifact_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" text,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"title_en" text DEFAULT '' NOT NULL,
	"genre" text NOT NULL,
	"status" "series_status" DEFAULT 'planning' NOT NULL,
	"brief" jsonb NOT NULL,
	"logline" text DEFAULT '' NOT NULL,
	"root_note" text DEFAULT '' NOT NULL,
	"cover_url" text DEFAULT '' NOT NULL,
	"auto_approve" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "series_sources" (
	"series_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"role" text DEFAULT 'engine' NOT NULL,
	CONSTRAINT "series_sources_series_id_source_id_pk" PRIMARY KEY("series_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" "source_category" NOT NULL,
	"era" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visual_notes" text DEFAULT '' NOT NULL,
	"references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"caution" text DEFAULT '' NOT NULL,
	"overlap_works" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_ledger" ADD CONSTRAINT "cost_ledger_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_ledger" ADD CONSTRAINT "cost_ledger_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_ledger" ADD CONSTRAINT "cost_ledger_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_ledger" ADD CONSTRAINT "decision_ledger_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_ledger" ADD CONSTRAINT "decision_ledger_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guideline_versions" ADD CONSTRAINT "guideline_versions_guideline_id_guidelines_id_fk" FOREIGN KEY ("guideline_id") REFERENCES "public"."guidelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_sources" ADD CONSTRAINT "series_sources_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_sources" ADD CONSTRAINT "series_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifacts_scope" ON "artifacts" USING btree ("series_id","episode_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "episodes_series_number" ON "episodes" USING btree ("series_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "guideline_versions_gv" ON "guideline_versions" USING btree ("guideline_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "guidelines_scope_agent" ON "guidelines" USING btree ("scope","scope_ref","agent");--> statement-breakpoint
CREATE INDEX "jobs_status_run_after" ON "jobs" USING btree ("status","run_after");