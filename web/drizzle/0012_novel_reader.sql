CREATE TABLE "episode_texts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"paragraphs" jsonb NOT NULL,
	"chars" integer DEFAULT 0 NOT NULL,
	"read_minutes" integer DEFAULT 0 NOT NULL,
	"source_artifact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "wait_free_exclude" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "early_price" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "episode_texts" ADD CONSTRAINT "episode_texts_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "episode_texts_episode_locale" ON "episode_texts" USING btree ("episode_id","locale");--> statement-breakpoint
-- 이미 만든 웹소설 작품에 웹소설 판매 기준을 맞춰요 (07번: 무료 10화, 회차 1코인, 선공개 2코인, 최신 10화 기다무 제외)
UPDATE "series" SET "wait_free_exclude" = 10, "early_price" = 2, "free_episodes" = 10 WHERE "format" = 'novel';--> statement-breakpoint
UPDATE "episodes" SET "price_coins" = 1 WHERE "series_id" IN (SELECT "id" FROM "series" WHERE "format" = 'novel');
