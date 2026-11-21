CREATE TABLE "coin_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coins" integer NOT NULL,
	"bonus_coins" integer DEFAULT 0 NOT NULL,
	"price_krw" integer NOT NULL,
	"apple_product_id" text DEFAULT '' NOT NULL,
	"google_product_id" text DEFAULT '' NOT NULL,
	"badge" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coin_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reader_id" uuid NOT NULL,
	"delta_paid" integer DEFAULT 0 NOT NULL,
	"delta_free" integer DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"ref_id" text,
	"balance_after" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coin_wallets" (
	"reader_id" uuid PRIMARY KEY NOT NULL,
	"paid" integer DEFAULT 0 NOT NULL,
	"free" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_reactions" (
	"reader_id" uuid NOT NULL,
	"episode_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "episode_reactions_reader_id_episode_id_pk" PRIMARY KEY("reader_id","episode_id")
);
--> statement-breakpoint
CREATE TABLE "episode_unlocks" (
	"reader_id" uuid NOT NULL,
	"episode_id" uuid NOT NULL,
	"method" text NOT NULL,
	"coins_spent" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "episode_unlocks_reader_id_episode_id_pk" PRIMARY KEY("reader_id","episode_id")
);
--> statement-breakpoint
CREATE TABLE "notification_prefs" (
	"reader_id" uuid PRIMARY KEY NOT NULL,
	"new_episode" boolean DEFAULT true NOT NULL,
	"wait_free" boolean DEFAULT true NOT NULL,
	"events" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reader_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"href" text DEFAULT '' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reader_id" uuid,
	"kind" text NOT NULL,
	"product_id" text NOT NULL,
	"amount_krw" integer NOT NULL,
	"store" text NOT NULL,
	"store_transaction_id" text NOT NULL,
	"status" text NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"reader_id" uuid PRIMARY KEY NOT NULL,
	"store" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "view_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" uuid NOT NULL,
	"episode_id" uuid NOT NULL,
	"reader_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wait_free_timers" (
	"reader_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"next_at" timestamp with time zone NOT NULL,
	CONSTRAINT "wait_free_timers_reader_id_series_id_pk" PRIMARY KEY("reader_id","series_id")
);
--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "price_coins" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "early_access" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "readers" ADD COLUMN "auto_unlock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "free_episodes" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "wait_free" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "is_dummy" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_reader_id_readers_id_fk" FOREIGN KEY ("reader_id") REFERENCES "public"."readers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_wallets" ADD CONSTRAINT "coin_wallets_reader_id_readers_id_fk" FOREIGN KEY ("reader_id") REFERENCES "public"."readers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_reactions" ADD CONSTRAINT "episode_reactions_reader_id_readers_id_fk" FOREIGN KEY ("reader_id") REFERENCES "public"."readers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_reactions" ADD CONSTRAINT "episode_reactions_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_unlocks" ADD CONSTRAINT "episode_unlocks_reader_id_readers_id_fk" FOREIGN KEY ("reader_id") REFERENCES "public"."readers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_unlocks" ADD CONSTRAINT "episode_unlocks_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_reader_id_readers_id_fk" FOREIGN KEY ("reader_id") REFERENCES "public"."readers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_reader_id_readers_id_fk" FOREIGN KEY ("reader_id") REFERENCES "public"."readers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reader_id_readers_id_fk" FOREIGN KEY ("reader_id") REFERENCES "public"."readers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_reader_id_readers_id_fk" FOREIGN KEY ("reader_id") REFERENCES "public"."readers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_events" ADD CONSTRAINT "view_events_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_events" ADD CONSTRAINT "view_events_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_events" ADD CONSTRAINT "view_events_reader_id_readers_id_fk" FOREIGN KEY ("reader_id") REFERENCES "public"."readers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wait_free_timers" ADD CONSTRAINT "wait_free_timers_reader_id_readers_id_fk" FOREIGN KEY ("reader_id") REFERENCES "public"."readers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wait_free_timers" ADD CONSTRAINT "wait_free_timers_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coin_transactions_idem" ON "coin_transactions" USING btree ("reader_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "coin_transactions_reader_at" ON "coin_transactions" USING btree ("reader_id","created_at");--> statement-breakpoint
CREATE INDEX "episode_reactions_episode" ON "episode_reactions" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "notifications_reader_at" ON "notifications" USING btree ("reader_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_store_tx" ON "payments" USING btree ("store","store_transaction_id");--> statement-breakpoint
CREATE INDEX "view_events_at" ON "view_events" USING btree ("created_at","series_id");--> statement-breakpoint
ALTER TABLE "coin_wallets" ADD CONSTRAINT "coin_wallets_non_negative" CHECK ("paid" >= 0 AND "free" >= 0);--> statement-breakpoint
INSERT INTO "coin_products" ("coins", "bonus_coins", "price_krw", "apple_product_id", "google_product_id", "badge", "sort") VALUES
  (10, 0, 1200, 'kr.noriva.coins.10', 'coins_10', '', 1),
  (50, 5, 5900, 'kr.noriva.coins.50', 'coins_50', '많이 사요', 2),
  (100, 15, 11000, 'kr.noriva.coins.100', 'coins_100', '', 3),
  (300, 60, 33000, 'kr.noriva.coins.300', 'coins_300', '보너스 최대', 4);
