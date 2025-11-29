"use server";

import { db } from "@/drizzle/db";
import { messageRequest, providers } from "@/drizzle/schema";
import { isNull, and, gte, lt, count, sum, avg, eq, desc, sql } from "drizzle-orm";
import { Decimal, toCostDecimal } from "@/lib/utils/currency";

/**
 * 今日概览统计数据
 */
export interface OverviewMetrics {
  /** 今日总请求数 */
  todayRequests: number;
  /** 今日总消耗（美元） */
  todayCost: number;
  /** 平均响应时间（毫秒） */
  avgResponseTime: number;
}

export interface ProviderUsageSnapshot {
  providerId: number;
  providerName: string;
  totalRequests: number;
  totalCost: number;
  successRate: number;
}

export interface ProviderErrorSnapshot {
  providerId: number | null;
  providerName: string | null;
  statusCode: number | null;
  count: number;
}

export interface RecentRequestEntry {
  id: number;
  providerName: string | null;
  model: string | null;
  statusCode: number | null;
  costUsd: string | null;
  createdAt: Date | null;
}

export interface UserPreferenceSnapshot {
  favoriteProvider: string | null;
  favoriteModel: string | null;
}

/**
 * 获取今日概览统计数据
 * 包括：今日总请求数、今日总消耗、平均响应时间
 */
export async function getOverviewMetrics(): Promise<OverviewMetrics> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [result] = await db
    .select({
      requestCount: count(),
      totalCost: sum(messageRequest.costUsd),
      avgDuration: avg(messageRequest.durationMs),
    })
    .from(messageRequest)
    .where(
      and(
        isNull(messageRequest.deletedAt),
        gte(messageRequest.createdAt, today),
        lt(messageRequest.createdAt, tomorrow)
      )
    );

  // 处理成本数据
  const costDecimal = toCostDecimal(result.totalCost) ?? new Decimal(0);
  const todayCost = costDecimal.toDecimalPlaces(6).toNumber();

  // 处理平均响应时间（转换为整数）
  const avgResponseTime = result.avgDuration ? Math.round(Number(result.avgDuration)) : 0;

  return {
    todayRequests: Number(result.requestCount || 0),
    todayCost,
    avgResponseTime,
  };
}

/**
 * 获取今日概览统计数据（用户级别）
 * 包括：用户今日总请求数、今日总消耗、平均响应时间
 *
 * @param userId - 用户 ID
 */
export async function getOverviewMetricsByUser(
  userId: number,
  keyValue?: string
): Promise<OverviewMetrics> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const conditions = [
    isNull(messageRequest.deletedAt),
    gte(messageRequest.createdAt, today),
    lt(messageRequest.createdAt, tomorrow),
    eq(messageRequest.userId, userId),
  ];

  if (keyValue) {
    conditions.push(eq(messageRequest.key, keyValue));
  }

  const [result] = await db
    .select({
      requestCount: count(),
      // 优先使用 package_cost_usd + balance_cost_usd，如果都为NULL则fallback到cost_usd
      totalCost: sql<string>`COALESCE(
        SUM(
          COALESCE(${messageRequest.packageCostUsd}, 0) +
          COALESCE(${messageRequest.balanceCostUsd}, 0)
        ),
        SUM(COALESCE(${messageRequest.costUsd}, 0)),
        0
      )`,
      avgDuration: avg(messageRequest.durationMs),
    })
    .from(messageRequest)
    .where(and(...conditions));

  // 处理成本数据
  const costDecimal = toCostDecimal(result.totalCost) ?? new Decimal(0);
  const todayCost = costDecimal.toDecimalPlaces(6).toNumber();

  // 处理平均响应时间（转换为整数）
  const avgResponseTime = result.avgDuration ? Math.round(Number(result.avgDuration)) : 0;

  return {
    todayRequests: Number(result.requestCount || 0),
    todayCost,
    avgResponseTime,
  };
}

/**
 * 获取今日最活跃的供应商（按消耗排序）
 */
export async function getTopProvidersToday(limit = 3): Promise<ProviderUsageSnapshot[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const rows = await db
    .select({
      providerId: messageRequest.providerId,
      providerName: providers.name,
      totalRequests: sql<number>`count(*)::double precision`,
      totalCost: sql<string>`COALESCE(sum(${messageRequest.costUsd}), 0)`,
      successCount: sql<number>`sum(CASE WHEN ${messageRequest.statusCode} BETWEEN 200 AND 399 THEN 1 ELSE 0 END)::double precision`,
    })
    .from(messageRequest)
    .innerJoin(
      providers,
      and(eq(messageRequest.providerId, providers.id), isNull(providers.deletedAt))
    )
    .where(
      and(
        isNull(messageRequest.deletedAt),
        sql`${messageRequest.providerId} IS NOT NULL`,
        gte(messageRequest.createdAt, today),
        lt(messageRequest.createdAt, tomorrow)
      )
    )
    .groupBy(messageRequest.providerId, providers.name)
    .orderBy(desc(sql`sum(${messageRequest.costUsd})`))
    .limit(limit);

  return rows.map((row) => {
    const totalRequests = row.totalRequests || 0;
    const successRate =
      totalRequests > 0 ? Math.round(((row.successCount || 0) / totalRequests) * 1000) / 10 : 0;

    return {
      providerId: row.providerId ?? 0,
      providerName: row.providerName ?? "未知供应商",
      totalRequests,
      totalCost: parseFloat(row.totalCost),
      successRate,
    };
  });
}

/**
 * 获取最近出现错误最多的供应商 / 状态码
 */
export async function getRecentProviderErrors(limit = 3): Promise<ProviderErrorSnapshot[]> {
  const since = new Date();
  since.setHours(since.getHours() - 6);

  const rows = await db
    .select({
      providerId: messageRequest.providerId,
      providerName: providers.name,
      statusCode: messageRequest.statusCode,
      count: sql<number>`count(*)::double precision`,
    })
    .from(messageRequest)
    .leftJoin(
      providers,
      and(eq(messageRequest.providerId, providers.id), isNull(providers.deletedAt))
    )
    .where(
      and(
        isNull(messageRequest.deletedAt),
        gte(messageRequest.createdAt, since),
        sql`${messageRequest.statusCode} >= 400`
      )
    )
    .groupBy(messageRequest.providerId, providers.name, messageRequest.statusCode)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);

  return rows.map((row) => ({
    providerId: row.providerId,
    providerName: row.providerName,
    statusCode: row.statusCode,
    count: row.count,
  }));
}

/**
 * 获取用户最近的调用记录
 */
export async function getRecentRequestsByUser(
  userId: number,
  limit = 5,
  keyValue?: string
): Promise<RecentRequestEntry[]> {
  const conditions = [isNull(messageRequest.deletedAt), eq(messageRequest.userId, userId)];
  if (keyValue) {
    conditions.push(eq(messageRequest.key, keyValue));
  }

  const rows = await db
    .select({
      id: messageRequest.id,
      providerName: providers.name,
      model: messageRequest.model,
      statusCode: messageRequest.statusCode,
      costUsd: messageRequest.costUsd,
      createdAt: messageRequest.createdAt,
    })
    .from(messageRequest)
    .leftJoin(
      providers,
      and(eq(messageRequest.providerId, providers.id), isNull(providers.deletedAt))
    )
    .where(and(...conditions))
    .orderBy(desc(messageRequest.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    providerName: row.providerName,
    model: row.model,
    statusCode: row.statusCode,
    costUsd: row.costUsd,
    createdAt: row.createdAt,
  }));
}

/**
 * 获取用户常用的供应商 / 模型（近 7 天）
 */
export async function getUserPreferenceSnapshot(
  userId: number,
  keyValue?: string
): Promise<UserPreferenceSnapshot> {
  const start = new Date();
  start.setDate(start.getDate() - 7);

  const baseConditions = [
    isNull(messageRequest.deletedAt),
    eq(messageRequest.userId, userId),
    gte(messageRequest.createdAt, start),
  ];

  if (keyValue) {
    baseConditions.push(eq(messageRequest.key, keyValue));
  }

  const [providerRow] = await db
    .select({
      providerName: providers.name,
      total: sql<number>`count(*)::double precision`,
    })
    .from(messageRequest)
    .leftJoin(
      providers,
      and(eq(messageRequest.providerId, providers.id), isNull(providers.deletedAt))
    )
    .where(and(...baseConditions))
    .groupBy(messageRequest.providerId, providers.name)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  const [modelRow] = await db
    .select({
      model: messageRequest.model,
      total: sql<number>`count(*)::double precision`,
    })
    .from(messageRequest)
    .where(and(...baseConditions, sql`${messageRequest.model} IS NOT NULL`))
    .groupBy(messageRequest.model)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  return {
    favoriteProvider: providerRow?.providerName ?? null,
    favoriteModel: modelRow?.model ?? null,
  };
}
