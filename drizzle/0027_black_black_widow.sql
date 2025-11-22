-- 创建余额流水表
CREATE TABLE "balance_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" numeric(12, 4) NOT NULL,
	"balance_before" numeric(12, 4) NOT NULL,
	"balance_after" numeric(12, 4) NOT NULL,
	"type" varchar(20) NOT NULL,
	"operator_id" integer,
	"operator_name" varchar(64),
	"note" text,
	"message_request_id" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

-- 添加 users 表的余额字段
ALTER TABLE "users" ADD COLUMN "balance_usd" numeric(12, 4) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "balance_updated_at" timestamp with time zone;
--> statement-breakpoint

-- 添加 message_request 表的支付来源字段
ALTER TABLE "message_request" ADD COLUMN "payment_source" varchar(20);
--> statement-breakpoint
ALTER TABLE "message_request" ADD COLUMN "package_cost_usd" numeric(21, 15);
--> statement-breakpoint
ALTER TABLE "message_request" ADD COLUMN "balance_cost_usd" numeric(21, 15);
--> statement-breakpoint

-- 创建余额流水表索引
CREATE INDEX "idx_balance_transactions_user_time" ON "balance_transactions" USING btree ("user_id","created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "idx_balance_transactions_type" ON "balance_transactions" USING btree ("type");
--> statement-breakpoint
CREATE INDEX "idx_balance_transactions_message" ON "balance_transactions" USING btree ("message_request_id");
