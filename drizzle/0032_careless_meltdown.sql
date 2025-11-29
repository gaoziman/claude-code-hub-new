DROP INDEX "idx_keys_owner_key_id";--> statement-breakpoint
ALTER TABLE "keys" DROP COLUMN "scope";--> statement-breakpoint
ALTER TABLE "keys" DROP COLUMN "owner_key_id";