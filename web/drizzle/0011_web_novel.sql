ALTER TYPE "public"."agent_kind" ADD VALUE 'novelist';--> statement-breakpoint
ALTER TYPE "public"."agent_kind" ADD VALUE 'copyeditor';--> statement-breakpoint
ALTER TYPE "public"."stage" ADD VALUE 'manuscript' BEFORE 'scout';--> statement-breakpoint
ALTER TYPE "public"."stage" ADD VALUE 'copyedit' BEFORE 'scout';--> statement-breakpoint
CREATE TABLE "series_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" uuid NOT NULL,
	"role" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'company' NOT NULL,
	"ai_tool" text DEFAULT '' NOT NULL,
	"basis" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"from_episode" integer,
	"visible" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "format" text DEFAULT 'webtoon' NOT NULL;--> statement-breakpoint
ALTER TABLE "series_credits" ADD CONSTRAINT "series_credits_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "series_credits_series" ON "series_credits" USING btree ("series_id","sort");