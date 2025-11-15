/**
 * 数据一致性相关类型定义
 */

// ========== 一致性检测相关 ==========

/**
 * 一致性维度
 */
export type ConsistencyDimension = "total" | "daily" | "weekly" | "monthly" | "5h";

/**
 * 一致性状态
 */
export type ConsistencyStatus = "inconsistent" | "redis_missing" | "database_missing" | "consistent";

/**
 * 单个 Key 的一致性检测项
 */
export interface ConsistencyCheckItem {
  keyId: number;
  keyName: string;
  dimension: ConsistencyDimension;
  redisValue: number | null;
  databaseValue: number;
  difference: number;
  differenceRate: number; // 百分比
  status: ConsistencyStatus;
  lastUpdated?: Date;
}

/**
 * 完整的一致性检测结果
 */
export interface ConsistencyCheckResult {
  timestamp: Date;
  totalKeysChecked: number;
  inconsistentCount: number;
  totalDifferenceUsd: number;
  averageDifferenceRate: number;
  items: ConsistencyCheckItem[];
}

// ========== 定时任务配置相关 ==========

/**
 * 定时任务间隔（小时）
 */
export type TaskIntervalHours = 1 | 3 | 6 | 12 | 24;

/**
 * 定时任务配置
 */
export interface ConsistencyTaskConfig {
  id: number;
  enabled: boolean;
  intervalHours: TaskIntervalHours;
  autoFix: boolean;
  thresholdUsd: number;
  thresholdRate: number; // 百分比
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 任务运行状态
 */
export interface TaskStatus {
  enabled: boolean;
  intervalHours: TaskIntervalHours;
  isRunning: boolean;
  lastRun: Date | null;
  nextRun: Date | null;
  lastRunResult: {
    keysChecked: number;
    inconsistenciesFound: number;
    itemsFixed: number;
  } | null;
}

// ========== 操作历史相关 ==========

/**
 * 操作类型
 */
export type ConsistencyOperationType =
  | "manual_check"       // 手动检测
  | "scheduled_check"    // 定时检测
  | "manual_fix"         // 手动修复
  | "auto_fix"           // 自动修复
  | "global_rebuild";    // 全局重建

/**
 * 操作者类型
 */
export type ConsistencyOperator = "admin" | "system";

/**
 * 操作历史记录
 */
export interface ConsistencyHistory {
  id: number;
  timestamp: Date;
  operationType: ConsistencyOperationType;
  operator: ConsistencyOperator;
  keysChecked: number;
  inconsistenciesFound: number;
  itemsFixed: number;
  totalDifference: string; // numeric 类型,与数据库一致
  details: ConsistencyCheckResult | null;
  createdAt: Date;
}

// ========== 数据库实体类型 ==========

/**
 * consistency_task_config 表实体
 */
export interface ConsistencyTaskConfigEntity {
  id: number;
  enabled: boolean;
  intervalHours: number;  // Drizzle schema 使用 camelCase
  autoFix: boolean;
  thresholdUsd: string; // numeric 类型
  thresholdRate: string; // numeric 类型
  createdAt: Date | null;
  updatedAt: Date | null;
}

/**
 * consistency_history 表实体
 */
export interface ConsistencyHistoryEntity {
  id: number;
  timestamp: Date;
  operationType: string;  // Drizzle schema 使用 camelCase
  operator: string;
  keysChecked: number;
  inconsistenciesFound: number;
  itemsFixed: number;
  totalDifference: string; // numeric 类型
  details: unknown; // JSONB
  createdAt: Date | null;
}

// ========== 请求/响应类型 ==========

/**
 * 检测请求参数
 */
export interface CheckConsistencyRequest {
  /** 仅检测特定 Key ID（可选）*/
  keyIds?: number[];
  /** 仅检测特定维度（可选）*/
  dimensions?: ConsistencyDimension[];
  /** 差异阈值（美元）*/
  thresholdUsd?: number;
  /** 差异阈值（百分比）*/
  thresholdRate?: number;
}

/**
 * 修复请求参数
 */
export interface FixInconsistencyRequest {
  keyId: number;
  dimension: ConsistencyDimension;
}

/**
 * 批量修复请求参数
 */
export interface FixAllInconsistenciesRequest {
  /** 修复的项目列表 */
  items: FixInconsistencyRequest[];
}

/**
 * 更新任务配置请求参数
 */
export interface UpdateTaskConfigRequest {
  enabled?: boolean;
  intervalHours?: TaskIntervalHours;
  autoFix?: boolean;
  thresholdUsd?: number;
  thresholdRate?: number;
}

/**
 * 操作历史查询参数
 */
export interface ConsistencyHistoryQuery {
  page: number;
  pageSize: number;
  operationType?: ConsistencyOperationType;
  days?: number; // 最近 N 天
}

/**
 * 操作历史查询响应
 */
export interface ConsistencyHistoryResponse {
  items: ConsistencyHistory[];
  total: number;
  page: number;
  pageSize: number;
}

// ========== UI 相关类型 ==========

/**
 * 维度选项（用于筛选器）
 */
export interface DimensionOption {
  label: string;
  value: ConsistencyDimension | "all";
}

/**
 * 操作类型选项（用于筛选器）
 */
export interface OperationTypeOption {
  label: string;
  value: ConsistencyOperationType | "all";
}

/**
 * 统计卡片数据
 */
export interface ConsistencyStatistics {
  totalKeysChecked: number;
  inconsistentCount: number;
  totalDifferenceUsd: number;
  averageDifferenceRate: number;
}
