ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "parent_user_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "force_password_change" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "max_keys_count" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "inherit_parent_limits" boolean DEFAULT true NOT NULL;--> statement-breakpoint

-- 添加父子关系外键约束
ALTER TABLE "users" ADD CONSTRAINT "fk_users_parent" FOREIGN KEY ("parent_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint

-- 添加约束：防止自引用
ALTER TABLE "users" ADD CONSTRAINT "chk_no_self_reference" CHECK ("parent_user_id" IS NULL OR "parent_user_id" != "id");--> statement-breakpoint

CREATE INDEX "idx_users_parent_user_id" ON "users" USING btree ("parent_user_id") WHERE "users"."deleted_at" IS NULL AND "users"."parent_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_users_password_hash" ON "users" USING btree ("password_hash") WHERE "users"."password_hash" IS NOT NULL;--> statement-breakpoint

-- 添加字段注释
COMMENT ON COLUMN "users"."parent_user_id" IS '父用户ID：User → Reseller，Reseller → Admin，Admin → NULL';--> statement-breakpoint
COMMENT ON COLUMN "users"."password_hash" IS 'bcrypt 密码哈希，用于密码登录';--> statement-breakpoint
COMMENT ON COLUMN "users"."max_keys_count" IS '用户最多可以创建的 Key 数量（默认 3）';--> statement-breakpoint
COMMENT ON COLUMN "users"."inherit_parent_limits" IS '是否继承父用户的额度限制（默认 TRUE），设置为 FALSE 时可以使用独立额度';
