ALTER TABLE "keys"
  ADD COLUMN IF NOT EXISTS "total_limit_usd" numeric(12, 2);
