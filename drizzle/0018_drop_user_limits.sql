-- 移除用户级 RPM 与每日额度列
ALTER TABLE "users"
  DROP COLUMN IF EXISTS "rpm_limit",
  DROP COLUMN IF EXISTS "daily_limit_usd";
