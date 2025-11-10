ALTER TABLE "keys"
  ADD COLUMN IF NOT EXISTS "scope" varchar(16) NOT NULL DEFAULT 'owner';

UPDATE "keys"
SET "scope" = 'owner'
WHERE "scope" IS NULL;
