"use server";

import { getSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  getUserStatisticsFromDB,
  getActiveUsersFromDB,
  getKeyStatisticsFromDB,
  getActiveKeysForUserFromDB,
  getMixedStatisticsFromDB,
  getProviderUsageTrendsFromDB,
  getTopKeysUsageTrendsFromDB,
  getTopUsersUsageTrendsFromDB,
} from "@/repository/statistics";
import { getSystemSettings } from "@/repository/system-config";
import type {
  TimeRange,
  UserStatisticsData,
  DatabaseStatRow,
  DatabaseUser,
  ChartDataItem,
  StatisticsUser,
  DatabaseKeyStatRow,
  DatabaseKey,
  ProviderTrendData,
  ProviderTrendRow,
  ProviderTrendSeries,
  KeyTrendData,
  KeyTrendRow,
  KeyTrendSeries,
  UserTrendData,
  UserTrendRow,
  UserTrendSeries,
} from "@/types/statistics";
import type { ProviderType } from "@/types/provider";
import { TIME_RANGE_OPTIONS, DEFAULT_TIME_RANGE } from "@/types/statistics";
import type { ActionResult } from "./types";
import { formatCostForStorage } from "@/lib/utils/currency";

/**
 * 生成图表数据使用的用户键，避免名称碰撞
 */
const createDataKey = (prefix: string, id: number): string => `${prefix}-${id}`;
const DEFAULT_PROVIDER_TREND_DAYS = 7;
const DEFAULT_PROVIDER_TREND_TYPE: ProviderType = "claude-auth";

/**
 * 获取用户统计数据，用于图表展示
 */
export async function getUserStatistics(
  timeRange: TimeRange = DEFAULT_TIME_RANGE
): Promise<ActionResult<UserStatisticsData>> {
  try {
    const session = await getSession();
    if (!session) {
      return {
        ok: false,
        error: "未登录",
      };
    }

    // 获取时间范围配置
    const rangeConfig = TIME_RANGE_OPTIONS.find((option) => option.key === timeRange);
    if (!rangeConfig) {
      throw new Error(`Invalid time range: ${timeRange}`);
    }

    const settings = await getSystemSettings();
    const isAdmin = session.user.role === "admin";
    const enforceKeyView = session.viewMode === "key";

    // 确定显示模式
    const mode: "users" | "keys" | "mixed" = enforceKeyView
      ? "keys"
      : isAdmin
        ? "users"
        : settings.allowGlobalUsageView
          ? "mixed"
          : "keys";

    const prefix = mode === "mixed" ? "key" : mode === "users" ? "user" : "key";

    let statsData: Array<DatabaseStatRow | DatabaseKeyStatRow>;
    let entities: Array<DatabaseUser | DatabaseKey>;

    if (mode === "users") {
      // Admin: 显示所有用户
      const [userStats, userList] = await Promise.all([
        getUserStatisticsFromDB(timeRange),
        getActiveUsersFromDB(),
      ]);
      statsData = userStats;
      entities = userList;
    } else if (mode === "mixed") {
      // 非 Admin + allowGlobalUsageView: 自己的密钥明细 + 其他用户汇总
      const [ownKeysList, mixedData] = await Promise.all([
        getActiveKeysForUserFromDB(session.user.id),
        getMixedStatisticsFromDB(session.user.id, timeRange),
      ]);

      // 合并数据：自己的密钥 + 其他用户的虚拟条目
      statsData = [...mixedData.ownKeys, ...mixedData.othersAggregate];

      // 合并实体列表：自己的密钥 + 其他用户虚拟实体
      entities = [...ownKeysList, { id: -1, name: "其他用户" }];
    } else {
      // 非 Admin 或强制 Key 视角：仅显示自己的密钥
      const [keyStats, keyList] = await Promise.all([
        getKeyStatisticsFromDB(session.user.id, timeRange),
        getActiveKeysForUserFromDB(session.user.id),
      ]);

      if (enforceKeyView && session.key) {
        const targetKeyId = session.key.id;
        statsData = keyStats.filter((row) => row.key_id === targetKeyId);
        entities = keyList.filter((key) => key.id === targetKeyId);
      } else {
        statsData = keyStats;
        entities = keyList;
      }
    }

    // 将数据转换为适合图表的格式
    const dataByDate = new Map<string, ChartDataItem>();

    statsData.forEach((row) => {
      // 根据分辨率格式化日期
      let dateStr: string;
      if (rangeConfig.resolution === "hour") {
        // 小时分辨率：显示为 "HH:mm" 格式
        const hour = new Date(row.date);
        dateStr = hour.toISOString();
      } else {
        // 天分辨率：显示为 "YYYY-MM-DD" 格式
        dateStr = new Date(row.date).toISOString().split("T")[0];
      }

      if (!dataByDate.has(dateStr)) {
        dataByDate.set(dateStr, {
          date: dateStr,
        });
      }

      const dateData = dataByDate.get(dateStr)!;

      const entityId = "user_id" in row ? row.user_id : row.key_id;
      const entityKey = createDataKey(prefix, entityId);

      // 安全地处理大数值，防止精度问题
      const cost = formatCostForStorage(row.total_cost) ?? formatCostForStorage(0)!;
      const calls = row.api_calls || 0;

      // 为每个用户创建消费和调用次数的键
      dateData[`${entityKey}_cost`] = cost;
      dateData[`${entityKey}_calls`] = calls;
    });

    const result: UserStatisticsData = {
      chartData: Array.from(dataByDate.values()),
      users: entities.map(
        (entity): StatisticsUser => ({
          id: entity.id,
          name: entity.name || (mode === "users" ? `User${entity.id}` : `Key${entity.id}`),
          dataKey: createDataKey(prefix, entity.id),
        })
      ),
      timeRange,
      resolution: rangeConfig.resolution,
      mode,
    };

    return {
      ok: true,
      data: result,
    };
  } catch (error) {
    logger.error("Failed to get user statistics:", error);

    // 提供更具体的错误信息
    const errorMessage = error instanceof Error ? error.message : "未知错误";
    if (errorMessage.includes("numeric field overflow")) {
      return {
        ok: false,
        error: "数据金额过大，请检查数据库中的费用记录",
      };
    }

    return {
      ok: false,
      error: "获取统计数据失败：" + errorMessage,
    };
  }
}

export async function getProviderUsageTrends(
  providerType: ProviderType = DEFAULT_PROVIDER_TREND_TYPE,
  days = DEFAULT_PROVIDER_TREND_DAYS
): Promise<ActionResult<ProviderTrendData>> {
  try {
    const session = await getSession();
    if (!session) {
      return {
        ok: false,
        error: "未登录",
      };
    }

    if (session.user.role !== "admin") {
      return {
        ok: false,
        error: "仅管理员可查看供应商趋势",
      };
    }

    const { providerMeta, rows } = await getProviderUsageTrendsFromDB(providerType, days);
    logger.debug("provider_usage_trends", {
      providerType,
      providerCount: providerMeta.length,
      rowCount: rows.length,
    });
    const data = buildProviderTrendData(rows, providerMeta, providerType, days);

    return {
      ok: true,
      data,
    };
  } catch (error) {
    logger.error("Failed to get provider usage trends:", error);
    const message = error instanceof Error ? error.message : "未知错误";
    return {
      ok: false,
      error: `获取供应商趋势失败：${message}`,
    };
  }
}

function buildProviderTrendData(
  rows: ProviderTrendRow[],
  providerMeta: { id: number; name: string }[],
  providerType: ProviderType,
  days: number
): ProviderTrendData {
  const clampedDays = Math.max(1, Math.min(days, 30));
  const chartDataMap = new Map<string, ChartDataItem>();
  const providerTotals = new Map<number, ProviderTrendSeries>();

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - (clampedDays - 1));

  for (let i = 0; i < clampedDays; i++) {
    const slot = new Date(startDate);
    slot.setDate(startDate.getDate() + i);
    const iso = slot.toISOString().split("T")[0];
    chartDataMap.set(iso, { date: iso });
  }

  providerMeta.forEach((provider) => {
    const dataKey = createDataKey("provider", provider.id);
    providerTotals.set(provider.id, {
      id: provider.id,
      name: provider.name,
      dataKey,
      totalCost: 0,
      totalCalls: 0,
    });
  });

  chartDataMap.forEach((entry) => {
    providerTotals.forEach((provider) => {
      entry[`${provider.dataKey}_cost`] = 0;
      entry[`${provider.dataKey}_calls`] = 0;
    });
  });

  // 处理供应商级别数据
  rows.forEach((row) => {
    const iso = new Date(row.date).toISOString().split("T")[0];
    const dataKey = createDataKey("provider", row.provider_id);
    const entry = chartDataMap.get(iso) ?? { date: iso };
    entry[`${dataKey}_cost`] = Number(row.total_cost ?? 0);
    entry[`${dataKey}_calls`] = Number(row.api_calls ?? 0);
    chartDataMap.set(iso, entry);

    const existing = providerTotals.get(row.provider_id);
    if (!existing) {
      providerTotals.set(row.provider_id, {
        id: row.provider_id,
        name: row.provider_name || `Provider${row.provider_id}`,
        dataKey,
        totalCost: Number(row.total_cost ?? 0),
        totalCalls: Number(row.api_calls ?? 0),
      });
      return;
    }

    existing.totalCost += Number(row.total_cost ?? 0);
    existing.totalCalls += Number(row.api_calls ?? 0);
    providerTotals.set(row.provider_id, existing);
  });

  const chartData = Array.from(chartDataMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, value]) => value);

  const providers = Array.from(providerTotals.values()).sort((a, b) => b.totalCost - a.totalCost);

  return {
    chartData,
    providers,
    providerType,
    days: clampedDays,
  };
}

/**
 * 获取 Top 7 Keys 使用趋势（近 N 天）
 */
const DEFAULT_KEY_TREND_DAYS = 7;

export async function getTopKeysUsageTrends(
  days = DEFAULT_KEY_TREND_DAYS
): Promise<ActionResult<KeyTrendData>> {
  try {
    const session = await getSession();
    if (!session) {
      return {
        ok: false,
        error: "未登录",
      };
    }

    if (session.user.role !== "admin") {
      return {
        ok: false,
        error: "仅管理员可查看 API Keys 趋势",
      };
    }

    const { keyMeta, rows } = await getTopKeysUsageTrendsFromDB(days);
    logger.debug("top_keys_usage_trends", {
      keyCount: keyMeta.length,
      rowCount: rows.length,
    });
    const data = buildKeyTrendData(rows, keyMeta, days);

    return {
      ok: true,
      data,
    };
  } catch (error) {
    logger.error("Failed to get top keys usage trends:", error);
    const message = error instanceof Error ? error.message : "未知错误";
    return {
      ok: false,
      error: `获取 API Keys 趋势失败：${message}`,
    };
  }
}

function buildKeyTrendData(
  rows: KeyTrendRow[],
  keyMeta: { id: number; name: string }[],
  days: number
): KeyTrendData {
  const clampedDays = Math.max(1, Math.min(days, 30));
  const chartDataMap = new Map<string, ChartDataItem>();
  const keyTotals = new Map<number, KeyTrendSeries>();

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - (clampedDays - 1));

  // 初始化日期范围
  for (let i = 0; i < clampedDays; i++) {
    const slot = new Date(startDate);
    slot.setDate(startDate.getDate() + i);
    const iso = slot.toISOString().split("T")[0];
    chartDataMap.set(iso, { date: iso });
  }

  // 初始化 Key 总计
  keyMeta.forEach((key) => {
    const dataKey = createDataKey("key", key.id);
    keyTotals.set(key.id, {
      id: key.id,
      name: key.name,
      dataKey,
      totalCost: 0,
      totalCalls: 0,
    });
  });

  // 初始化每个日期的每个 Key 的数据为 0
  chartDataMap.forEach((entry) => {
    keyTotals.forEach((key) => {
      entry[`${key.dataKey}_cost`] = 0;
      entry[`${key.dataKey}_calls`] = 0;
    });
  });

  // 处理查询结果数据
  rows.forEach((row) => {
    const iso = new Date(row.date).toISOString().split("T")[0];
    const dataKey = createDataKey("key", row.key_id);
    const entry = chartDataMap.get(iso) ?? { date: iso };
    entry[`${dataKey}_cost`] = Number(row.total_cost ?? 0);
    entry[`${dataKey}_calls`] = Number(row.api_calls ?? 0);
    chartDataMap.set(iso, entry);

    const existing = keyTotals.get(row.key_id);
    if (!existing) {
      keyTotals.set(row.key_id, {
        id: row.key_id,
        name: row.key_name || `Key${row.key_id}`,
        dataKey,
        totalCost: Number(row.total_cost ?? 0),
        totalCalls: Number(row.api_calls ?? 0),
      });
      return;
    }

    existing.totalCost += Number(row.total_cost ?? 0);
    existing.totalCalls += Number(row.api_calls ?? 0);
    keyTotals.set(row.key_id, existing);
  });

  const chartData = Array.from(chartDataMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, value]) => value);

  const keys = Array.from(keyTotals.values()).sort((a, b) => b.totalCost - a.totalCost);

  return {
    chartData,
    keys,
    days: clampedDays,
  };
}

/**
 * 获取 Top 7 用户使用趋势（近 N 天）
 */
const DEFAULT_USER_TREND_DAYS = 7;

export async function getTopUsersUsageTrends(
  days = DEFAULT_USER_TREND_DAYS
): Promise<ActionResult<UserTrendData>> {
  try {
    const session = await getSession();
    if (!session) {
      return {
        ok: false,
        error: "未登录",
      };
    }

    if (session.user.role !== "admin") {
      return {
        ok: false,
        error: "仅管理员可查看用户趋势",
      };
    }

    const { userMeta, rows } = await getTopUsersUsageTrendsFromDB(days);
    logger.debug("top_users_usage_trends", {
      userCount: userMeta.length,
      rowCount: rows.length,
    });
    const data = buildUserTrendData(rows, userMeta, days);

    return {
      ok: true,
      data,
    };
  } catch (error) {
    logger.error("Failed to get top users usage trends:", error);
    const message = error instanceof Error ? error.message : "未知错误";
    return {
      ok: false,
      error: `获取用户趋势失败：${message}`,
    };
  }
}

function buildUserTrendData(
  rows: UserTrendRow[],
  userMeta: { id: number; name: string }[],
  days: number
): UserTrendData {
  const clampedDays = Math.max(1, Math.min(days, 30));
  const chartDataMap = new Map<string, ChartDataItem>();
  const userTotals = new Map<number, UserTrendSeries>();

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - (clampedDays - 1));

  // 初始化日期范围
  for (let i = 0; i < clampedDays; i++) {
    const slot = new Date(startDate);
    slot.setDate(startDate.getDate() + i);
    const iso = slot.toISOString().split("T")[0];
    chartDataMap.set(iso, { date: iso });
  }

  // 初始化用户总计
  userMeta.forEach((user) => {
    const dataKey = createDataKey("user", user.id);
    userTotals.set(user.id, {
      id: user.id,
      name: user.name,
      dataKey,
      totalCost: 0,
      totalCalls: 0,
    });
  });

  // 初始化每个日期的每个用户的数据为 0
  chartDataMap.forEach((entry) => {
    userTotals.forEach((user) => {
      entry[`${user.dataKey}_cost`] = 0;
      entry[`${user.dataKey}_calls`] = 0;
    });
  });

  // 处理查询结果数据
  rows.forEach((row) => {
    const iso = new Date(row.date).toISOString().split("T")[0];
    const dataKey = createDataKey("user", row.user_id);
    const entry = chartDataMap.get(iso) ?? { date: iso };
    entry[`${dataKey}_cost`] = Number(row.total_cost ?? 0);
    entry[`${dataKey}_calls`] = Number(row.api_calls ?? 0);
    chartDataMap.set(iso, entry);

    const existing = userTotals.get(row.user_id);
    if (!existing) {
      userTotals.set(row.user_id, {
        id: row.user_id,
        name: row.user_name || `User${row.user_id}`,
        dataKey,
        totalCost: Number(row.total_cost ?? 0),
        totalCalls: Number(row.api_calls ?? 0),
      });
      return;
    }

    existing.totalCost += Number(row.total_cost ?? 0);
    existing.totalCalls += Number(row.api_calls ?? 0);
    userTotals.set(row.user_id, existing);
  });

  const chartData = Array.from(chartDataMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, value]) => value);

  const users = Array.from(userTotals.values()).sort((a, b) => b.totalCost - a.totalCost);

  return {
    chartData,
    users,
    days: clampedDays,
  };
}
