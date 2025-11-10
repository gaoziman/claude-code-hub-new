-- 将限额下放到 Key 层：新增 Key 的 RPM 与每日额度字段
ALTER TABLE "keys"
  ADD COLUMN IF NOT EXISTS "rpm_limit" integer DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "daily_limit_usd" numeric(10, 2) DEFAULT 100.00;

-- 将现有用户配置迁移到各自的 Key 上
UPDATE "keys" AS k
SET
  "rpm_limit" = COALESCE(u."rpm_limit", 100),
  "daily_limit_usd" = COALESCE(u."daily_limit_usd", 100)
FROM "users" AS u
WHERE k."user_id" = u."id";
