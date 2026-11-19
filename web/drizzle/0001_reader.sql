CREATE TABLE "episode_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"panels" jsonb NOT NULL,
	"source_artifact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "logline_en" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "root_note_en" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "schedule_days" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "episode_assets" ADD CONSTRAINT "episode_assets_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "episode_assets_episode_locale" ON "episode_assets" USING btree ("episode_id","locale");