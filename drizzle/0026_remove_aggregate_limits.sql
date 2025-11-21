-- ========================================
-- 迁移 0026: 删除主 Key 聚合限额字段
-- 描述: 简化限额架构，从三层简化为两层（用户层 + Key独立层）
-- 原因: 每个用户只有一个主Key，聚合限额与用户级别限额重复
-- ========================================

-- 删除 keys 表的聚合限额字段
ALTER TABLE "keys" DROP COLUMN IF EXISTS "aggregate_limit_5h_usd";--> statement-breakpoint
ALTER TABLE "keys" DROP COLUMN IF EXISTS "aggregate_limit_weekly_usd";--> statement-breakpoint
ALTER TABLE "keys" DROP COLUMN IF EXISTS "aggregate_limit_monthly_usd";--> statement-breakpoint
ALTER TABLE "keys" DROP COLUMN IF EXISTS "aggregate_total_limit_usd";
