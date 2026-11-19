CREATE TYPE "public"."candidate_status" AS ENUM('pending', 'adopted', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."scout_run_status" AS ENUM('running', 'done', 'failed');--> statement-breakpoint
ALTER TYPE "public"."stage" ADD VALUE 'scout';--> statement-breakpoint
ALTER TYPE "public"."stage" ADD VALUE 'source_fill';--> statement-breakpoint
CREATE TABLE "scout_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"focus" text DEFAULT '' NOT NULL,
	"status" "scout_run_status" DEFAULT 'running' NOT NULL,
	"report" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"status" "candidate_status" DEFAULT 'pending' NOT NULL,
	"body" jsonb NOT NULL,
	"dismiss_reason" text DEFAULT '' NOT NULL,
	"source_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "series_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scout_runs" ADD CONSTRAINT "scout_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_candidates" ADD CONSTRAINT "source_candidates_run_id_scout_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scout_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_candidates" ADD CONSTRAINT "source_candidates_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_candidates_status" ON "source_candidates" USING btree ("status","created_at");