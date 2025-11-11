ALTER TABLE "providers" ALTER COLUMN "cost_multiplier" SET DEFAULT '0.6';--> statement-breakpoint
ALTER TABLE "keys" ADD COLUMN "scope" varchar(16) DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "keys" ADD COLUMN "total_limit_usd" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "keys" ADD COLUMN "rpm_limit" integer DEFAULT 100;--> statement-breakpoint
ALTER TABLE "keys" ADD COLUMN "daily_limit_usd" numeric(10, 2) DEFAULT '100.00';--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN "circuit_breaker_channels" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN "daily_leaderboard_channels" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN "cost_alert_channels" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "theme_config" jsonb DEFAULT jsonb_build_object('baseColor', '#FF8A00', 'accentColor', '#FFB347', 'neutralColor', '#FFE8CC') NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "rpm_limit";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "daily_limit_usd";