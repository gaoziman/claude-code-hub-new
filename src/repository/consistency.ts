"use server";

import { db } from "@/drizzle/db";
import { consistencyTaskConfig, consistencyHistory } from "@/drizzle/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import type {
  ConsistencyTaskConfig,
  ConsistencyHistory,
  ConsistencyHistoryQuery,
  ConsistencyHistoryResponse,
  UpdateTaskConfigRequest,
  ConsistencyTaskConfigEntity,
  ConsistencyHistoryEntity,
} from "@/types/consistency";

/**
 * 数据一致性任务配置 Repository
 */

/**
 * 获取任务配置（单例）
 * 如果不存在，则创建默认配置
 */
export async function getTaskConfig(): Promise<ConsistencyTaskConfig> {
  const [config] = await db
    .select()
    .from(consistencyTaskConfig)
    .limit(1);

  if (!config) {
    // 不存在则创建默认配置
    return await createDefaultConfig();
  }

  return toTaskConfig(config);
}

/**
 * 创建默认配置
 */
async function createDefaultConfig(): Promise<ConsistencyTaskConfig> {
  const [config] = await db
    .insert(consistencyTaskConfig)
    .values({
      enabled: false,
      intervalHours: 6,
      autoFix: false,
      thresholdUsd: "0.01",
      thresholdRate: "5.00",
    })
    .returning();

  return toTaskConfig(config);
}

/**
 * 更新任务配置
 */
export async function updateTaskConfig(
  updates: UpdateTaskConfigRequest
): Promise<ConsistencyTaskConfig> {
  // 确保配置存在
  const existing = await getTaskConfig();

  // 构建更新数据
  const updateData: Partial<ConsistencyTaskConfigEntity> = {
    updatedAt: new Date(),
  };

  if (updates.enabled !== undefined) {
    updateData.enabled = updates.enabled;
  }
  if (updates.intervalHours !== undefined) {
    updateData.intervalHours = updates.intervalHours;
  }
  if (updates.autoFix !== undefined) {
    updateData.autoFix = updates.autoFix;
  }
  if (updates.thresholdUsd !== undefined) {
    updateData.thresholdUsd = updates.thresholdUsd.toString();
  }
  if (updates.thresholdRate !== undefined) {
    updateData.thresholdRate = updates.thresholdRate.toString();
  }

  const [updated] = await db
    .update(consistencyTaskConfig)
    .set(updateData)
    .where(eq(consistencyTaskConfig.id, existing.id))
    .returning();

  return toTaskConfig(updated);
}

/**
 * 数据库实体转换为应用类型
 */
function toTaskConfig(entity: ConsistencyTaskConfigEntity): ConsistencyTaskConfig {
  return {
    id: entity.id,
    enabled: entity.enabled,
    intervalHours: entity.intervalHours as 1 | 3 | 6 | 12 | 24,
    autoFix: entity.autoFix,
    thresholdUsd: parseFloat(entity.thresholdUsd),
    thresholdRate: parseFloat(entity.thresholdRate),
    createdAt: entity.createdAt || new Date(),
    updatedAt: entity.updatedAt || new Date(),
  };
}

/**
 * 数据一致性操作历史 Repository
 */

/**
 * 创建操作历史记录
 */
export async function createConsistencyHistory(
  data: Omit<ConsistencyHistory, "id" | "createdAt">
): Promise<ConsistencyHistory> {
  const [record] = await db
    .insert(consistencyHistory)
    .values({
      timestamp: data.timestamp,
      operationType: data.operationType,
      operator: data.operator,
      keysChecked: data.keysChecked,
      inconsistenciesFound: data.inconsistenciesFound,
      itemsFixed: data.itemsFixed,
      totalDifference: data.totalDifference.toString(),
      details: data.details as object,
    })
    .returning();

  return toConsistencyHistory(record);
}

/**
 * 查询操作历史（分页）
 */
export async function findConsistencyHistory(
  query: ConsistencyHistoryQuery
): Promise<ConsistencyHistoryResponse> {
  const { page, pageSize, operationType, days } = query;
  const offset = (page - 1) * pageSize;

  // 构建查询条件
  const conditions = [];

  if (operationType) {
    conditions.push(eq(consistencyHistory.operationType, operationType));
  }

  if (days && days > 0) {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);
    conditions.push(gte(consistencyHistory.timestamp, daysAgo));
  }

  // 查询总数
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(consistencyHistory)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const total = countResult?.count ?? 0;

  // 查询数据
  const records = await db
    .select()
    .from(consistencyHistory)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(consistencyHistory.timestamp))
    .limit(pageSize)
    .offset(offset);

  const items = records.map(toConsistencyHistory);

  return {
    items,
    total,
    page,
    pageSize,
  };
}

/**
 * 根据 ID 获取操作历史详情
 */
export async function findConsistencyHistoryById(
  id: number
): Promise<ConsistencyHistory | null> {
  const [record] = await db
    .select()
    .from(consistencyHistory)
    .where(eq(consistencyHistory.id, id))
    .limit(1);

  if (!record) return null;

  return toConsistencyHistory(record);
}

/**
 * 获取最近一次操作历史
 */
export async function findLatestConsistencyHistory(): Promise<ConsistencyHistory | null> {
  const [record] = await db
    .select()
    .from(consistencyHistory)
    .orderBy(desc(consistencyHistory.timestamp))
    .limit(1);

  if (!record) return null;

  return toConsistencyHistory(record);
}

/**
 * 删除过期的操作历史（保留最近 N 天）
 */
export async function cleanupOldConsistencyHistory(
  retentionDays: number = 30
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await db
    .delete(consistencyHistory)
    .where(sql`${consistencyHistory.timestamp} < ${cutoffDate}`)
    .returning({ id: consistencyHistory.id });

  return result.length;
}

/**
 * 数据库实体转换为应用类型
 */
function toConsistencyHistory(entity: ConsistencyHistoryEntity): ConsistencyHistory {
  return {
    id: entity.id,
    timestamp: entity.timestamp,
    operationType: entity.operationType as ConsistencyHistory["operationType"],
    operator: entity.operator as ConsistencyHistory["operator"],
    keysChecked: entity.keysChecked,
    inconsistenciesFound: entity.inconsistenciesFound,
    itemsFixed: entity.itemsFixed,
    totalDifference: entity.totalDifference,
    details: entity.details as ConsistencyHistory["details"],
    createdAt: entity.createdAt || new Date(),
  };
}

/**
 * 获取操作统计信息
 */
export async function getConsistencyStatistics(days: number = 7): Promise<{
  totalChecks: number;
  totalInconsistencies: number;
  totalFixed: number;
  fixRate: number;
}> {
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - days);

  const [stats] = await db
    .select({
      totalChecks: sql<number>`count(*)::int`,
      totalInconsistencies: sql<number>`sum(${consistencyHistory.inconsistenciesFound})::int`,
      totalFixed: sql<number>`sum(${consistencyHistory.itemsFixed})::int`,
    })
    .from(consistencyHistory)
    .where(gte(consistencyHistory.timestamp, daysAgo));

  const totalChecks = stats?.totalChecks ?? 0;
  const totalInconsistencies = stats?.totalInconsistencies ?? 0;
  const totalFixed = stats?.totalFixed ?? 0;
  const fixRate = totalInconsistencies > 0 ? (totalFixed / totalInconsistencies) * 100 : 0;

  return {
    totalChecks,
    totalInconsistencies,
    totalFixed,
    fixRate,
  };
}
