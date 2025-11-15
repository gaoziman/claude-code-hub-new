CREATE TABLE IF NOT EXISTS "consistency_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"operation_type" varchar(50) NOT NULL,
	"operator" varchar(50) NOT NULL,
	"keys_checked" integer DEFAULT 0 NOT NULL,
	"inconsistencies_found" integer DEFAULT 0 NOT NULL,
	"items_fixed" integer DEFAULT 0 NOT NULL,
	"total_difference" numeric(12, 6) DEFAULT '0' NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consistency_task_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"interval_hours" integer DEFAULT 6 NOT NULL,
	"auto_fix" boolean DEFAULT false NOT NULL,
	"threshold_usd" numeric(10, 4) DEFAULT '0.01' NOT NULL,
	"threshold_rate" numeric(5, 2) DEFAULT '5.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_consistency_history_timestamp" ON "consistency_history" USING btree ("timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_consistency_history_operation_type" ON "consistency_history" USING btree ("operation_type");