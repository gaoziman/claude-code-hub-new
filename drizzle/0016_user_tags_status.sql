-- 添加用户禁用、过期与标签字段
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "is_enabled" boolean NOT NULL DEFAULT true;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "tags" jsonb NOT NULL DEFAULT '[]'::jsonb;
