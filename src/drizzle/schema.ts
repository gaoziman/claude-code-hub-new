import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  index
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import type { NotificationChannelConfig } from '@/types/notification';
import type { SystemThemeConfig } from '@/types/system-config';

// Users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name').notNull(),
  description: text('description'),
  role: varchar('role', { length: 20 }).notNull().default('user').$type<'admin' | 'reseller' | 'user'>(),
  providerGroup: varchar('provider_group', { length: 50 }),
  isEnabled: boolean('is_enabled').notNull().default(true),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  tags: jsonb('tags').$type<string[]>().notNull().default(sql`'[]'::jsonb`),

  // ========== 父子关系配置 ==========
  // 父用户 ID：User → Reseller，Reseller → Admin，Admin → NULL
  parentUserId: integer('parent_user_id'),

  // ========== 密码认证配置 ==========
  passwordHash: varchar('password_hash', { length: 255 }), // bcrypt 密码哈希
  passwordUpdatedAt: timestamp('password_updated_at', { withTimezone: true }), // 密码最后修改时间
  forcePasswordChange: boolean('force_password_change').notNull().default(false), // 强制修改密码标记

  // ========== Key 管理配置 ==========
  maxKeysCount: integer('max_keys_count').notNull().default(3), // 最多可创建的 Key 数量

  // ========== 用户级别限额配置（管理员设置） ==========
  limit5hUsd: numeric('limit_5h_usd', { precision: 10, scale: 2 }),
  limitWeeklyUsd: numeric('limit_weekly_usd', { precision: 10, scale: 2 }),
  limitMonthlyUsd: numeric('limit_monthly_usd', { precision: 10, scale: 2 }),
  totalLimitUsd: numeric('total_limit_usd', { precision: 12, scale: 2 }),

  // ========== 额度共享配置 ==========
  // 是否继承父用户的额度限制（默认 TRUE）
  // 设置为 FALSE 时可以使用独立额度，不受父用户限制
  inheritParentLimits: boolean('inherit_parent_limits').notNull().default(true),

  // ========== 账期周期配置 ==========
  // 账期起始日期：用于计算周/月限额的起点
  // 周限额从此日期开始每7天重置，月限额从此日期开始每30天重置
  // 默认为用户创建时间，管理员可手动调整
  billingCycleStart: timestamp('billing_cycle_start', { withTimezone: true }),

  // ========== 余额系统（按量付费） ==========
  balanceUsd: numeric('balance_usd', { precision: 12, scale: 4 }).notNull().default('0'),
  balanceUpdatedAt: timestamp('balance_updated_at', { withTimezone: true }),

  // ========== 余额使用策略（子用户专用） ==========
  // 控制子用户如何使用账户余额
  // - disabled: 禁止使用余额（套餐用完即停止）
  // - after_quota: 配额用完后可用余额（默认，灵活充值）
  // - priority: 优先使用余额（余额不足才用套餐）
  balanceUsagePolicy: varchar('balance_usage_policy', { length: 20 })
    .notNull()
    .default('after_quota')
    .$type<'disabled' | 'after_quota' | 'priority'>(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  // 优化用户列表查询的复合索引（按角色排序，管理员优先）
  usersActiveRoleSortIdx: index('idx_users_active_role_sort').on(table.deletedAt, table.role, table.id).where(sql`${table.deletedAt} IS NULL`),
  // 父子关系索引
  usersParentUserIdIdx: index('idx_users_parent_user_id').on(table.parentUserId).where(sql`${table.deletedAt} IS NULL AND ${table.parentUserId} IS NOT NULL`),
  // 密码索引（用于登录查询）
  usersPasswordHashIdx: index('idx_users_password_hash').on(table.passwordHash).where(sql`${table.passwordHash} IS NOT NULL`),
  // 基础索引
  usersCreatedAtIdx: index('idx_users_created_at').on(table.createdAt),
  usersDeletedAtIdx: index('idx_users_deleted_at').on(table.deletedAt),
}));

// Keys table
export const keys = pgTable('keys', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  key: varchar('key').notNull(),
  name: varchar('name').notNull(),
  isEnabled: boolean('is_enabled').default(true),
  expiresAt: timestamp('expires_at'),

  // Web UI 登录权限控制
  canLoginWebUi: boolean('can_login_web_ui').default(true),

  // ========== 独立限额配置 ==========
  limit5hUsd: numeric('limit_5h_usd', { precision: 10, scale: 2 }),
  limitWeeklyUsd: numeric('limit_weekly_usd', { precision: 10, scale: 2 }),
  limitMonthlyUsd: numeric('limit_monthly_usd', { precision: 10, scale: 2 }),
  totalLimitUsd: numeric('total_limit_usd', { precision: 12, scale: 2 }),
  limitConcurrentSessions: integer('limit_concurrent_sessions').default(0),
  rpmLimit: integer('rpm_limit').default(100),
  dailyLimitUsd: numeric('daily_limit_usd', { precision: 10, scale: 2 }).default('100.00'),

  // ========== 账期周期配置 ==========
  // Key 的账期起始日期：用于计算该 Key 独立的周/月限额周期
  // 如果为空，则继承所属用户的 billingCycleStart
  billingCycleStart: timestamp('billing_cycle_start', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  // 基础索引（详细的复合索引通过迁移脚本管理）
  keysUserIdIdx: index('idx_keys_user_id').on(table.userId),
  keysCreatedAtIdx: index('idx_keys_created_at').on(table.createdAt),
  keysDeletedAtIdx: index('idx_keys_deleted_at').on(table.deletedAt),
}));

// Providers table
export const providers = pgTable('providers', {
  id: serial('id').primaryKey(),
  name: varchar('name').notNull(),
  description: text('description'),
  url: varchar('url').notNull(),
  key: varchar('key').notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  weight: integer('weight').notNull().default(1),

  // 优先级和分组配置
  priority: integer('priority').notNull().default(0),
  costMultiplier: numeric('cost_multiplier', { precision: 10, scale: 4 }).default('0.6'),
  groupTag: varchar('group_tag', { length: 50 }),

  // 供应商类型：扩展支持 5 种类型
  // - claude: Anthropic 提供商（标准认证）
  // - claude-auth: Claude 中转服务（仅 Bearer 认证，不发送 x-api-key）
  // - codex: Codex CLI (Response API)
  // - gemini-cli: Gemini CLI
  // - openai-compatible: OpenAI Compatible API
  providerType: varchar('provider_type', { length: 20 })
    .notNull()
    .default('claude')
    .$type<'claude' | 'claude-auth' | 'codex' | 'gemini-cli' | 'openai-compatible'>(),

  // 模型重定向：将请求的模型名称重定向到另一个模型
  modelRedirects: jsonb('model_redirects').$type<Record<string, string>>(),

  // 模型列表：双重语义
  // - Anthropic 提供商：白名单（管理员限制可调度的模型，可选）
  // - 非 Anthropic 提供商：声明列表（提供商声称支持的模型，可选）
  // - null 或空数组：Anthropic 允许所有 claude 模型，非 Anthropic 允许任意模型
  allowedModels: jsonb('allowed_models').$type<string[] | null>().default(null),

  // 加入 Claude 调度池：仅对非 Anthropic 提供商有效
  // 启用后，如果该提供商配置了重定向到 claude-* 模型，可以加入 claude 调度池
  joinClaudePool: boolean('join_claude_pool').default(false),

  // Codex Instructions 策略：控制如何处理 Codex 请求的 instructions 字段
  // - 'auto' (默认): 透传客户端 instructions，400 错误时自动重试（使用官方 instructions）
  // - 'force_official': 始终强制使用官方 Codex CLI instructions（约 4000+ 字完整 prompt）
  // - 'keep_original': 始终透传客户端 instructions，不自动重试（适用于宽松的中转站）
  // 仅对 providerType = 'codex' 的供应商有效
  codexInstructionsStrategy: varchar('codex_instructions_strategy', { length: 20 })
    .default('auto')
    .$type<'auto' | 'force_official' | 'keep_original'>(),

  // 金额限流配置
  limit5hUsd: numeric('limit_5h_usd', { precision: 10, scale: 2 }),
  limitWeeklyUsd: numeric('limit_weekly_usd', { precision: 10, scale: 2 }),
  limitMonthlyUsd: numeric('limit_monthly_usd', { precision: 10, scale: 2 }),
  limitConcurrentSessions: integer('limit_concurrent_sessions').default(0),

  // 熔断器配置（每个供应商独立配置）
  circuitBreakerFailureThreshold: integer('circuit_breaker_failure_threshold').default(5),
  circuitBreakerOpenDuration: integer('circuit_breaker_open_duration').default(1800000), // 30分钟（毫秒）
  circuitBreakerHalfOpenSuccessThreshold: integer('circuit_breaker_half_open_success_threshold').default(2),

  // 代理配置（支持 HTTP/HTTPS/SOCKS5）
  proxyUrl: varchar('proxy_url', { length: 512 }),
  proxyFallbackToDirect: boolean('proxy_fallback_to_direct').default(false),

  // 客户端限制：仅限官方 Claude CLI 调用
  // 启用后，只有官方 Claude Code 客户端才能调用此供应商
  // 第三方工具（如 Cursor、IDE 插件）将被拒绝访问
  onlyClaudeCli: boolean('only_claude_cli').notNull().default(true),

  // 废弃（保留向后兼容，但不再使用）
  tpm: integer('tpm').default(0),
  rpm: integer('rpm').default(0),
  rpd: integer('rpd').default(0),
  cc: integer('cc').default(0),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  // 优化启用状态的服务商查询（按优先级和权重排序）
  providersEnabledPriorityIdx: index('idx_providers_enabled_priority').on(table.isEnabled, table.priority, table.weight).where(sql`${table.deletedAt} IS NULL`),
  // 分组查询优化
  providersGroupIdx: index('idx_providers_group').on(table.groupTag).where(sql`${table.deletedAt} IS NULL`),
  // 基础索引
  providersCreatedAtIdx: index('idx_providers_created_at').on(table.createdAt),
  providersDeletedAtIdx: index('idx_providers_deleted_at').on(table.deletedAt),
}));

// Message Request table
export const messageRequest = pgTable('message_request', {
  id: serial('id').primaryKey(),
  providerId: integer('provider_id').notNull(),
  userId: integer('user_id').notNull(),
  key: varchar('key').notNull(),
  model: varchar('model', { length: 128 }),
  durationMs: integer('duration_ms'),
  costUsd: numeric('cost_usd', { precision: 21, scale: 15 }).default('0'),

  // 供应商倍率（用于日志展示，记录该请求使用的 cost_multiplier）
  costMultiplier: numeric('cost_multiplier', { precision: 10, scale: 4 }),

  // ========== 支付来源追踪（双轨计费） ==========
  // 支付来源：package=仅套餐, balance=仅余额, mixed=混合支付
  paymentSource: varchar('payment_source', { length: 20 }).$type<'package' | 'balance' | 'mixed'>(),
  // 从套餐中扣除的金额（套餐限额内消耗）
  packageCostUsd: numeric('package_cost_usd', { precision: 21, scale: 15 }),
  // 从余额中扣除的金额（按量付费消耗）
  balanceCostUsd: numeric('balance_cost_usd', { precision: 21, scale: 15 }),

  // ========== 剩余额度快照 ==========
  // 请求完成后的剩余可用额度快照（套餐剩余 + 账户余额）
  remainingQuotaUsd: numeric('remaining_quota_usd', { precision: 21, scale: 15 }),

  // Session ID（用于会话粘性和日志追踪）
  sessionId: varchar('session_id', { length: 64 }),

  // 上游决策链（记录尝试的供应商列表）
  providerChain: jsonb('provider_chain').$type<Array<{ id: number; name: string }>>(),

  // HTTP 状态码
  statusCode: integer('status_code'),

  // Codex 支持：API 类型（'response' 或 'openai'）
  apiType: varchar('api_type', { length: 20 }),

  // 模型重定向：原始模型名称（用户请求的模型，用于前端显示和计费）
  originalModel: varchar('original_model', { length: 128 }),

  // Token 使用信息
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  cacheCreationInputTokens: integer('cache_creation_input_tokens'),
  cacheReadInputTokens: integer('cache_read_input_tokens'),

  // 错误信息
  errorMessage: text('error_message'),

  // 拦截原因（用于记录被敏感词等规则拦截的请求）
  blockedBy: varchar('blocked_by', { length: 50 }),
  blockedReason: text('blocked_reason'),

  // User-Agent（用于客户端类型分析）
  userAgent: varchar('user_agent', { length: 512 }),

  // Messages 数量（用于短请求检测和分析）
  messagesCount: integer('messages_count'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  // 优化统计查询的复合索引（用户+时间+费用）
  messageRequestUserDateCostIdx: index('idx_message_request_user_date_cost').on(table.userId, table.createdAt, table.costUsd).where(sql`${table.deletedAt} IS NULL`),
  // 优化用户查询的复合索引（按创建时间倒序）
  messageRequestUserQueryIdx: index('idx_message_request_user_query').on(table.userId, table.createdAt).where(sql`${table.deletedAt} IS NULL`),
  // Session 查询索引（按 session 聚合查看对话）
  messageRequestSessionIdIdx: index('idx_message_request_session_id').on(table.sessionId).where(sql`${table.deletedAt} IS NULL`),
  // 基础索引
  messageRequestProviderIdIdx: index('idx_message_request_provider_id').on(table.providerId),
  messageRequestUserIdIdx: index('idx_message_request_user_id').on(table.userId),
  messageRequestKeyIdx: index('idx_message_request_key').on(table.key),
  messageRequestCreatedAtIdx: index('idx_message_request_created_at').on(table.createdAt),
  messageRequestDeletedAtIdx: index('idx_message_request_deleted_at').on(table.deletedAt),
}));

// Model Prices table
export const modelPrices = pgTable('model_prices', {
  id: serial('id').primaryKey(),
  modelName: varchar('model_name').notNull(),
  priceData: jsonb('price_data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  // 优化获取最新价格的复合索引
  modelPricesLatestIdx: index('idx_model_prices_latest').on(table.modelName, table.createdAt.desc()),
  // 基础索引
  modelPricesModelNameIdx: index('idx_model_prices_model_name').on(table.modelName),
  modelPricesCreatedAtIdx: index('idx_model_prices_created_at').on(table.createdAt.desc()),
}));

// Sensitive Words table
export const sensitiveWords = pgTable('sensitive_words', {
  id: serial('id').primaryKey(),
  word: varchar('word', { length: 255 }).notNull(),
  matchType: varchar('match_type', { length: 20 }).notNull().default('contains'),
  description: text('description'),
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  // 优化启用状态和匹配类型的查询
  sensitiveWordsEnabledIdx: index('idx_sensitive_words_enabled').on(table.isEnabled, table.matchType),
  // 基础索引
  sensitiveWordsCreatedAtIdx: index('idx_sensitive_words_created_at').on(table.createdAt),
}));

// System Settings table
export const systemSettings = pgTable('system_settings', {
  id: serial('id').primaryKey(),
  siteTitle: varchar('site_title', { length: 128 }).notNull().default('Claude Code Hub'),
  allowGlobalUsageView: boolean('allow_global_usage_view').notNull().default(false),

  // 货币显示配置
  currencyDisplay: varchar('currency_display', { length: 10 }).notNull().default('USD'),

  // 主题配置
  themeConfig: jsonb('theme_config')
    .$type<SystemThemeConfig>()
    .notNull()
    .default(
      sql`'{"baseColor":"#FF8A00","accentColor":"#FFB347","neutralColor":"#FFE8CC"}'::jsonb`
    ),

  // 日志清理配置
  enableAutoCleanup: boolean('enable_auto_cleanup').default(false),
  cleanupRetentionDays: integer('cleanup_retention_days').default(30),
  cleanupSchedule: varchar('cleanup_schedule', { length: 50 }).default('0 2 * * *'),
  cleanupBatchSize: integer('cleanup_batch_size').default(10000),

  // 客户端版本检查配置
  enableClientVersionCheck: boolean('enable_client_version_check').notNull().default(false),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Notification Settings table - 企业微信机器人通知配置
export const notificationSettings = pgTable('notification_settings', {
  id: serial('id').primaryKey(),

  // 全局开关
  enabled: boolean('enabled').notNull().default(false),

  // 熔断器告警配置
  circuitBreakerEnabled: boolean('circuit_breaker_enabled').notNull().default(false),
  circuitBreakerWebhook: varchar('circuit_breaker_webhook', { length: 512 }),
  circuitBreakerChannels: jsonb('circuit_breaker_channels')
    .$type<NotificationChannelConfig[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),

  // 每日用户消费排行榜配置
  dailyLeaderboardEnabled: boolean('daily_leaderboard_enabled').notNull().default(false),
  dailyLeaderboardWebhook: varchar('daily_leaderboard_webhook', { length: 512 }),
  dailyLeaderboardTime: varchar('daily_leaderboard_time', { length: 10 }).default('09:00'), // HH:mm 格式
  dailyLeaderboardTopN: integer('daily_leaderboard_top_n').default(5), // 显示前 N 名
  dailyLeaderboardChannels: jsonb('daily_leaderboard_channels')
    .$type<NotificationChannelConfig[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),

  // 成本预警配置
  costAlertEnabled: boolean('cost_alert_enabled').notNull().default(false),
  costAlertWebhook: varchar('cost_alert_webhook', { length: 512 }),
  costAlertThreshold: numeric('cost_alert_threshold', { precision: 5, scale: 2 }).default('0.80'), // 阈值 0-1 (80% = 0.80)
  costAlertCheckInterval: integer('cost_alert_check_interval').default(60), // 检查间隔（分钟）
  costAlertChannels: jsonb('cost_alert_channels')
    .$type<NotificationChannelConfig[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Consistency task config table (数据一致性定时任务配置)
export const consistencyTaskConfig = pgTable('consistency_task_config', {
  id: serial('id').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  intervalHours: integer('interval_hours').notNull().default(6),
  autoFix: boolean('auto_fix').notNull().default(false),
  thresholdUsd: numeric('threshold_usd', { precision: 10, scale: 4 }).notNull().default('0.01'),
  thresholdRate: numeric('threshold_rate', { precision: 5, scale: 2 }).notNull().default('5.00'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Consistency history table (数据一致性操作历史)
export const consistencyHistory = pgTable('consistency_history', {
  id: serial('id').primaryKey(),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  operationType: varchar('operation_type', { length: 50 }).notNull(),
  operator: varchar('operator', { length: 50 }).notNull(),
  keysChecked: integer('keys_checked').notNull().default(0),
  inconsistenciesFound: integer('inconsistencies_found').notNull().default(0),
  itemsFixed: integer('items_fixed').notNull().default(0),
  totalDifference: numeric('total_difference', { precision: 12, scale: 6 }).notNull().default('0'),
  details: jsonb('details'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  timestampIdx: index('idx_consistency_history_timestamp').on(table.timestamp.desc()),
  operationTypeIdx: index('idx_consistency_history_operation_type').on(table.operationType),
}));

// Balance Transactions table (余额流水账)
export const balanceTransactions = pgTable('balance_transactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),

  // 变动金额（正数=充值，负数=扣款）
  amount: numeric('amount', { precision: 12, scale: 4 }).notNull(),

  // 变动前余额
  balanceBefore: numeric('balance_before', { precision: 12, scale: 4 }).notNull(),

  // 变动后余额
  balanceAfter: numeric('balance_after', { precision: 12, scale: 4 }).notNull(),

  // 交易类型：recharge=充值, deduction=扣款, refund=退款, adjustment=调整
  type: varchar('type', { length: 20 }).notNull().$type<'recharge' | 'deduction' | 'refund' | 'adjustment'>(),

  // 操作者ID（充值/调整时记录管理员ID，扣款时为系统）
  operatorId: integer('operator_id'),

  // 操作者名称（充值/调整时记录管理员名称，扣款时为 'system'）
  operatorName: varchar('operator_name', { length: 64 }),

  // 备注（充值原因、扣款关联的 message_request.id 等）
  note: text('note'),

  // 关联的消息请求ID（扣款时记录）
  messageRequestId: integer('message_request_id'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  // 优化按用户查询流水的复合索引（按时间倒序）
  balanceTransactionsUserTimeIdx: index('idx_balance_transactions_user_time').on(table.userId, table.createdAt.desc()),
  // 优化按类型查询的索引
  balanceTransactionsTypeIdx: index('idx_balance_transactions_type').on(table.type),
  // 关联消息请求的索引（扣款时关联）
  balanceTransactionsMessageIdx: index('idx_balance_transactions_message').on(table.messageRequestId),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  keys: many(keys),
  messageRequests: many(messageRequest),
  balanceTransactions: many(balanceTransactions),
}));

export const keysRelations = relations(keys, ({ one, many }) => ({
  user: one(users, {
    fields: [keys.userId],
    references: [users.id],
  }),
  messageRequests: many(messageRequest),
}));

export const providersRelations = relations(providers, ({ many }) => ({
  messageRequests: many(messageRequest),
}));

export const messageRequestRelations = relations(messageRequest, ({ one }) => ({
  user: one(users, {
    fields: [messageRequest.userId],
    references: [users.id],
  }),
  provider: one(providers, {
    fields: [messageRequest.providerId],
    references: [providers.id],
  }),
}));

export const balanceTransactionsRelations = relations(balanceTransactions, ({ one }) => ({
  user: one(users, {
    fields: [balanceTransactions.userId],
    references: [users.id],
  }),
}));
