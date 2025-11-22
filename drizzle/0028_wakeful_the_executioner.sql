ALTER TABLE "keys" ADD COLUMN "billing_cycle_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_cycle_start" timestamp with time zone;