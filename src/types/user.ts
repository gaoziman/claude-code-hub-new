/**
 * 用户数据库实体类型
 */
export interface User {
  id: number;
  name: string;
  description: string;
  role: "admin" | "user";
  providerGroup: string | null; // 供应商分组
  tags: string[];
  isEnabled: boolean;
  expiresAt: Date | null;

  // ========== 用户级别限额配置（管理员设置） ==========
  limit5hUsd: number | null; // 5小时消费上限（美元）
  limitWeeklyUsd: number | null; // 周消费上限（美元）
  limitMonthlyUsd: number | null; // 月消费上限（美元）
  totalLimitUsd: number | null; // 总费用上限（美元）

  // ========== 账期周期配置 ==========
  billingCycleStart: Date | null; // 账期起始日期

  // ========== 余额系统（按量付费） ==========
  balanceUsd: number; // 用户余额（美元），默认 0
  balanceUpdatedAt: Date | null; // 余额最后更新时间

  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

/**
 * 用户创建数据
 */
export interface CreateUserData {
  name: string;
  description: string;
  providerGroup?: string | null; // 可选，供应商分组
  tags?: string[];
  isEnabled?: boolean;
  expiresAt?: Date | null;

  // 用户级别限额配置
  limit5hUsd?: number | null;
  limitWeeklyUsd?: number | null;
  limitMonthlyUsd?: number | null;
  totalLimitUsd?: number | null;

  // 账期周期配置
  billingCycleStart?: Date | null;
}

/**
 * 用户更新数据
 */
export interface UpdateUserData {
  name?: string;
  description?: string;
  providerGroup?: string | null; // 可选，供应商分组
  tags?: string[];
  isEnabled?: boolean;
  expiresAt?: Date | null;

  // 用户级别限额配置
  limit5hUsd?: number | null;
  limitWeeklyUsd?: number | null;
  limitMonthlyUsd?: number | null;
  totalLimitUsd?: number | null;

  // 账期周期配置
  billingCycleStart?: Date | null;
}

/**
 * 用户密钥显示对象
 */
export interface UserKeyDisplay {
  id: number;
  name: string;
  maskedKey: string;
  fullKey?: string; // 仅管理员可见的完整密钥
  canCopy: boolean; // 是否可以复制完整密钥
  expiresAt: string; // 格式化后的日期字符串或"永不过期"
  status: "enabled" | "disabled";
  disabledReason?: "key_disabled" | "user_disabled" | "user_expired";
  todayUsage: number; // 今日消耗金额（美元）
  weeklyUsageUsd?: number; // 周期内消耗金额（美元）
  monthlyUsageUsd?: number; // 月周期消耗金额（美元）
  totalUsageUsd?: number; // 总消耗金额（美元）
  todayCallCount: number; // 今日调用次数
  lastUsedAt: Date | null; // 最后使用时间
  lastProviderName: string | null; // 最后调用的供应商名称
  modelStats: Array<{
    model: string;
    callCount: number;
    totalCost: number;
  }>; // 各模型统计（当天）
  createdAt: Date; // 创建时间
  createdAtFormatted: string; // 格式化后的具体时间
  rpmLimit: number | null; // Key RPM 限制
  dailyQuota: number | null; // Key 每日额度限制
  // Web UI 登录权限控制
  canLoginWebUi: boolean; // 是否允许使用该 Key 登录 Web UI
  scope: "owner" | "child";
  canManage?: boolean; // 当前登录视角是否允许管理该 Key

  // ========== 主子关系配置 ==========
  ownerKeyId: number | null; // 主 Key ID（仅子 Key 填写）

  // ========== 子 Key 独立限额配置 ==========
  limit5hUsd: number | null; // 5小时消费上限（美元）
  limitWeeklyUsd: number | null; // 周消费上限（美元）
  limitMonthlyUsd: number | null; // 月消费上限（美元）
  totalLimitUsd: number | null; // 总费用上限（美元）
  limitConcurrentSessions: number; // 并发 Session 上限
}

/**
 * 用户显示对象（用于前端组件）
 */
export interface UserDisplay {
  id: number;
  name: string;
  note?: string;
  role: "admin" | "user";
  providerGroup?: string | null;
  tags: string[];
  isEnabled: boolean;
  expiresAt?: string | null;
  isExpired: boolean;
  status: "active" | "disabled" | "expired";
  keys: UserKeyDisplay[];

  // ========== 用户级别限额配置 ==========
  limit5hUsd?: number | null;
  limitWeeklyUsd?: number | null;
  limitMonthlyUsd?: number | null;
  totalLimitUsd?: number | null;

  // ========== 账期周期配置 ==========
  billingCycleStart?: Date | null; // 账期起始日期

  // ========== 余额系统（按量付费） ==========
  balanceUsd?: number; // 用户余额（美元）
  balanceUpdatedAt?: Date | null; // 余额最后更新时间

  // ========== 用户聚合消费数据（所有 Key 的消费总和） ==========
  userAggregateWeeklyUsage?: number; // 用户所有 Key 的周消费总和
  userAggregateMonthlyUsage?: number; // 用户所有 Key 的月消费总和
  userAggregateTotalUsage?: number; // 用户所有 Key 的总消费总和
}

/**
 * 用户表单数据
 */
