-- ========================================
-- 迁移 0025: 添加多层限额控制
-- 描述: 实现用户级别 + 主 Key 聚合 + 子 Key 独立的三层限额控制
-- ========================================

-- ========== 第一部分：用户表添加限额字段 ==========
ALTER TABLE "users" ADD COLUMN "limit_5h_usd" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "limit_weekly_usd" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "limit_monthly_usd" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "total_limit_usd" numeric(12, 2);--> statement-breakpoint

-- ========== 第二部分：Keys 表添加主子关系和聚合限额字段 ==========
ALTER TABLE "keys" ADD COLUMN "owner_key_id" integer;--> statement-breakpoint
ALTER TABLE "keys" ADD COLUMN "aggregate_limit_5h_usd" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "keys" ADD COLUMN "aggregate_limit_weekly_usd" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "keys" ADD COLUMN "aggregate_limit_monthly_usd" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "keys" ADD COLUMN "aggregate_total_limit_usd" numeric(12, 2);--> statement-breakpoint

-- ========== 第三部分：添加外键约束 ==========
-- 主 Key 删除时自动级联删除所有子 Key
ALTER TABLE "keys" ADD CONSTRAINT "fk_keys_owner_key_id"
  FOREIGN KEY ("owner_key_id") REFERENCES "keys"("id") ON DELETE CASCADE;--> statement-breakpoint

-- ========== 第四部分：添加索引 ==========
CREATE INDEX "idx_keys_owner_key_id" ON "keys" USING btree ("owner_key_id");
