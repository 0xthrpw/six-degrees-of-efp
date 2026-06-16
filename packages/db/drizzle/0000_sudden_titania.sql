CREATE TABLE IF NOT EXISTS "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"ens_name" text,
	"ens_avatar" text,
	"followers_count" integer,
	"following_count" integer,
	"ens_updated_at" timestamp with time zone,
	"crawled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_puzzles" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"snapshot_id" integer NOT NULL,
	"start_id" integer NOT NULL,
	"target_id" integer NOT NULL,
	"par" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "edges" (
	"snapshot_id" integer NOT NULL,
	"src_id" integer NOT NULL,
	"dst_id" integer NOT NULL,
	CONSTRAINT "edges_snapshot_id_src_id_dst_id_pk" PRIMARY KEY("snapshot_id","src_id","dst_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "endless_pairs" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_id" integer NOT NULL,
	"start_id" integer NOT NULL,
	"target_id" integer NOT NULL,
	"par" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"puzzle_id" integer,
	"account_id" integer NOT NULL,
	"start_id" integer NOT NULL,
	"target_id" integer NOT NULL,
	"hops" smallint NOT NULL,
	"par" smallint NOT NULL,
	"time_ms" integer NOT NULL,
	"path" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"node_count" integer DEFAULT 0 NOT NULL,
	"edge_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'building' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_puzzles" ADD CONSTRAINT "daily_puzzles_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_puzzles" ADD CONSTRAINT "daily_puzzles_start_id_accounts_id_fk" FOREIGN KEY ("start_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_puzzles" ADD CONSTRAINT "daily_puzzles_target_id_accounts_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "edges" ADD CONSTRAINT "edges_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "edges" ADD CONSTRAINT "edges_src_id_accounts_id_fk" FOREIGN KEY ("src_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "edges" ADD CONSTRAINT "edges_dst_id_accounts_id_fk" FOREIGN KEY ("dst_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "endless_pairs" ADD CONSTRAINT "endless_pairs_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "endless_pairs" ADD CONSTRAINT "endless_pairs_start_id_accounts_id_fk" FOREIGN KEY ("start_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "endless_pairs" ADD CONSTRAINT "endless_pairs_target_id_accounts_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scores" ADD CONSTRAINT "scores_puzzle_id_daily_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "public"."daily_puzzles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scores" ADD CONSTRAINT "scores_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scores" ADD CONSTRAINT "scores_start_id_accounts_id_fk" FOREIGN KEY ("start_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scores" ADD CONSTRAINT "scores_target_id_accounts_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_address_uniq" ON "accounts" USING btree ("address");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_puzzles_date_uniq" ON "daily_puzzles" USING btree ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "edges_following_idx" ON "edges" USING btree ("snapshot_id","src_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "edges_followers_idx" ON "edges" USING btree ("snapshot_id","dst_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "endless_pairs_par_idx" ON "endless_pairs" USING btree ("snapshot_id","par");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "scores_daily_player_uniq" ON "scores" USING btree ("puzzle_id","account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scores_rank_idx" ON "scores" USING btree ("puzzle_id","hops","time_ms");