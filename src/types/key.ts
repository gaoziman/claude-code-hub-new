/**
 * 密钥数据库实体类型
 */
export interface Key {
  id: number;
  userId: number;
  name: string;
  key: string;
  isEnabled: boolean;
  expiresAt?: Date;

  // Web UI 登录权限控制
  canLoginWebUi: boolean;

  // ========== 独立限额 ==========
  limit5hUsd: number | null;
  limitWeeklyUsd: number | null;
  limitMonthlyUsd: number | null;
  totalLimitUsd: number | null;
  limitConcurrentSessions: number;
  rpmLimit: number | null;
  dailyLimitUsd: number | null;

  // ========== 账期周期配置 ==========
  billingCycleStart: Date | null; // 账期起始日期（如果为空，继承用户的）

  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

/**
 * 密钥创建数据
 */
export interface CreateKeyData {
  user_id: number;
  name: string;
  key: string;
  is_enabled?: boolean;
  expires_at?: Date;
  // Web UI 登录权限控制
  can_login_web_ui?: boolean;
  // ========== 独立限额配置 ==========
  limit_5h_usd?: number | null;
  limit_weekly_usd?: number | null;
  limit_monthly_usd?: number | null;
  total_limit_usd?: number | null;
  limit_concurrent_sessions?: number;
  rpm_limit?: number | null;
  daily_limit_usd?: number | null;
  // ========== 账期周期配置 ==========
  billing_cycle_start?: Date | null;
}

/**
 * 密钥更新数据
 */
export interface UpdateKeyData {
  name?: string;
  is_enabled?: boolean;
  expires_at?: Date;
  // Web UI 登录权限控制
  can_login_web_ui?: boolean;
  // ========== 独立限额配置 ==========
  limit_5h_usd?: number | null;
  limit_weekly_usd?: number | null;
  limit_monthly_usd?: number | null;
  total_limit_usd?: number | null;
  limit_concurrent_sessions?: number;
  rpm_limit?: number | null;
  daily_limit_usd?: number | null;
  // ========== 账期周期配置 ==========
  billing_cycle_start?: Date | null;
}
