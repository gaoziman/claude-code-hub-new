"use server";

import {
  getOverviewMetrics as getOverviewMetricsFromDB,
  getOverviewMetricsByUser as getOverviewMetricsByUserFromDB,
  getTopProvidersToday,
  getRecentProviderErrors,
  getRecentRequestsByUser,
  getUserPreferenceSnapshot,
  type ProviderUsageSnapshot,
  type ProviderErrorSnapshot,
  type RecentRequestEntry,
} from "@/repository/overview";
import { getActiveSessions as getActiveSessionsFromManager } from "./active-sessions";
import { logger } from "@/lib/logger";
import { getSession } from "@/lib/auth";
import { getSystemSettings } from "@/repository/system-config";
import {
  getActiveConcurrentSessions,
  getActiveConcurrentSessionsByUser,
  getActiveConcurrentSessionsByKey,
} from "@/lib/redis";
import { findDailyLeaderboard } from "@/repository/leaderboard";
import { getNotificationSettings } from "@/repository/notifications";
import { sumKeyCostInTimeRange, sumUserCostInTimeRange } from "@/repository/statistics";
import {
  getTimeRangeForPeriod,
  getResetInfo,
  getDailyResetTime,
  getTimeRangeForBillingPeriod,
  type TimePeriod,
} from "@/lib/rate-limit/time-utils";
import type { ActionResult } from "./types";
import type { ActiveSessionInfo } from "@/types/session";

/**
 * 概览数据（包含并发数和今日统计）
 */
export interface OverviewData {
  /** 当前并发数 */
  concurrentSessions: number;
  /** 今日总请求数 */
  todayRequests: number;
  /** 今日总消耗（美元） */
  todayCost: number;
  /** 平均响应时间（毫秒） */
  avgResponseTime: number;
  /** 最近活跃的Session列表（用于滚动展示） */
  recentSessions: ActiveSessionInfo[];
  /** 当前用户角色 */
  role: "admin" | "user";
  /** 是否允许全站视图 */
  allowGlobalUsageView: boolean;
  /** 系统健康状态 */
  systemHealth: {
    notificationsEnabled: boolean;
    autoCleanupEnabled: boolean;
    allowGlobalUsageView: boolean;
  };
  /** 管理员视图：热门用户 */
  topUsers?: Array<{
    userId: number;
    userName: string;
    totalRequests: number;
    totalCost: number;
  }>;
  /** 管理员视图：热门供应商 */
  topProviders?: ProviderUsageSnapshot[];
  /** 管理员视图：近期错误 */
  recentErrors?: ProviderErrorSnapshot[];
  /** 普通用户视图：个人摘要 */
  personalSummary?: {
    todayRequests: number;
    todayCost: number;
    favoriteProvider?: string | null;
    favoriteModel?: string | null;
    recentRequests: RecentRequestEntry[];
    /** 用户级别限额（所有Key总消费） */
    userSpendingLimits?: PersonalSpendingLimit[];
    /** Key级别限额（当前Key独立消费） */
    keySpendingLimits?: PersonalSpendingLimit[];
    /** 当前Key名称 */
    currentKeyName?: string;
    /** 账户余额（美元） */
    balanceUsd?: number;
  };
}

export type PersonalLimitType = "daily" | "5h" | "weekly" | "monthly" | "total" | "balance";

export interface PersonalSpendingLimit {
  key: PersonalLimitType;
  label: string;
  limit: number;
  used: number;
  /** 重置时间（仅 weekly 和 monthly 有值） */
  resetAt?: Date;
  /** 重置类型：natural=自然周期，rolling=滚动窗口 */
  resetType?: "natural" | "rolling";
}

/**
 * 获取概览数据（首页实时面板使用）
 *
 * ✅ 权限控制：根据 allowGlobalUsageView 配置决定显示范围
 * - 管理员：始终显示全局数据
 * - 普通用户 + allowGlobalUsageView=true：显示全局数据
 * - 普通用户 + allowGlobalUsageView=false：仅显示自己的数据
 */
export async function getOverviewData(): Promise<ActionResult<OverviewData>> {
  try {
    // 1. 验证用户登录状态
    const session = await getSession();
    if (!session) {
      return {
        ok: false,
        error: "未登录",
      };
    }

    // 2. 获取系统配置和用户角色
    const [settings, notificationSettings] = await Promise.all([
      getSystemSettings(),
      getNotificationSettings(),
    ]);
    const isAdmin = session.user.role === "admin";
    const currentUserId = session.user.id;
    const enforceKeyView = session.viewMode === "key";
    const scopedKeyValue = enforceKeyView && session.key ? session.key.key : undefined;

    // 3. 确定数据查询范围
    const shouldShowGlobal = !enforceKeyView && (isAdmin || settings.allowGlobalUsageView);

    let concurrentSessions: number;
    let metricsData: Awaited<ReturnType<typeof getOverviewMetricsFromDB>>;

    if (shouldShowGlobal) {
      // 显示全局数据：管理员 或 allowGlobalUsageView=true
      const [concurrent, metrics] = await Promise.all([
        getActiveConcurrentSessions(),
        getOverviewMetricsFromDB(),
      ]);
      concurrentSessions = concurrent;
      metricsData = metrics;

      logger.debug("[Overview] Global metrics view", {
        userId: currentUserId,
        isAdmin,
        allowGlobalUsageView: settings.allowGlobalUsageView,
        concurrentSessions,
        todayRequests: metricsData.todayRequests,
      });
    } else {
      // 显示用户或 Key 维度的数据
      const [concurrent, metrics] = await Promise.all([
        enforceKeyView && session.key
          ? getActiveConcurrentSessionsByKey(session.key.id)
          : getActiveConcurrentSessionsByUser(currentUserId),
        getOverviewMetricsByUserFromDB(currentUserId, scopedKeyValue),
      ]);
      concurrentSessions = concurrent;
      metricsData = metrics;

      logger.debug("[Overview] User metrics view", {
        userId: currentUserId,
        allowGlobalUsageView: settings.allowGlobalUsageView,
        concurrentSessions,
        todayRequests: metricsData.todayRequests,
      });
    }

    // 4. 获取活跃Session列表（已经在 active-sessions.ts 中做了权限过滤）
    const sessionsResult = await getActiveSessionsFromManager();
    const recentSessions = sessionsResult.ok ? sessionsResult.data.slice(0, 6) : [];

    const overview: OverviewData = {
      concurrentSessions,
      todayRequests: metricsData.todayRequests,
      todayCost: metricsData.todayCost,
      avgResponseTime: metricsData.avgResponseTime,
      recentSessions,
      role: isAdmin ? "admin" : "user",
      allowGlobalUsageView: settings.allowGlobalUsageView,
      systemHealth: {
        notificationsEnabled: notificationSettings.enabled,
        autoCleanupEnabled: Boolean(settings.enableAutoCleanup),
        allowGlobalUsageView: settings.allowGlobalUsageView,
      },
    };

    if (shouldShowGlobal) {
      const [leaderboard, providers, errors] = await Promise.all([
        findDailyLeaderboard(),
        getTopProvidersToday(3),
        getRecentProviderErrors(3),
      ]);

      overview.topUsers = leaderboard.slice(0, 3).map((entry) => ({
        userId: entry.userId,
        userName: entry.userName,
        totalRequests: entry.totalRequests,
        totalCost: entry.totalCost,
      }));
      overview.topProviders = providers;
      overview.recentErrors = errors;
    } else {
      // 非全局视图，构建用户个人摘要（可能是用户视角或Key视角）
      const promises: [
        Promise<Awaited<ReturnType<typeof getUserPreferenceSnapshot>>>,
        Promise<Awaited<ReturnType<typeof getRecentRequestsByUser>>>,
        Promise<Awaited<ReturnType<typeof buildPersonalSpendingLimits>>>,
        Promise<Awaited<ReturnType<typeof buildPersonalSpendingLimits>> | null>,
      ] = [
        getUserPreferenceSnapshot(currentUserId, scopedKeyValue),
        getRecentRequestsByUser(currentUserId, 5, scopedKeyValue),
        // 用户级别限额（所有Key总消费）
        buildPersonalSpendingLimits({
          source: session.user,
          todayCost: metricsData.todayCost,
          scopedKeyValue: undefined,
          userId: currentUserId,
          enforceKeyView: false,
          billingCycleStart: session.user.billingCycleStart, // ⭐ 传入账期起始日期
        }),
        // Key级别限额（当前Key独立消费）- 仅当key存在时计算
        session.key
          ? buildPersonalSpendingLimits({
              source: session.key,
              todayCost: metricsData.todayCost,
              scopedKeyValue,
              userId: currentUserId,
              enforceKeyView: true,
              billingCycleStart: session.user.billingCycleStart, // ⭐ Key也使用用户的账期起始日期
            })
          : Promise.resolve(null),
      ];

      const [preferences, recentRequests, userSpendingLimits, keySpendingLimits] =
        await Promise.all(promises);

      overview.personalSummary = {
        todayRequests: metricsData.todayRequests,
        todayCost: metricsData.todayCost,
        favoriteProvider: preferences.favoriteProvider,
        favoriteModel: preferences.favoriteModel,
        recentRequests,
        userSpendingLimits,
        keySpendingLimits: keySpendingLimits ?? undefined,
        currentKeyName: session.key?.name,
        balanceUsd: session.user.balanceUsd ?? 0,
      };
    }

    return {
      ok: true,
      data: overview,
    };
  } catch (error) {
    logger.error("Failed to get overview data:", error);
    return {
      ok: false,
      error: "获取概览数据失败",
    };
  }
}

interface LimitSource {
  limit5hUsd: number | null;
  limitWeeklyUsd: number | null;
  limitMonthlyUsd: number | null;
  totalLimitUsd: number | null;
  dailyLimitUsd?: number | null;
  balanceUsd?: number | null;
}

interface BuildLimitOptions {
  source: LimitSource;
  todayCost: number;
  scopedKeyValue?: string;
  userId: number;
  enforceKeyView: boolean;
  billingCycleStart?: Date | null; // ⭐ 新增：用户账期起始日期
}

async function buildPersonalSpendingLimits({
  source,
  todayCost,
  scopedKeyValue,
  userId,
  enforceKeyView,
  billingCycleStart,
}: BuildLimitOptions): Promise<PersonalSpendingLimit[]> {
  if (enforceKeyView && !scopedKeyValue) {
    return [];
  }

  // ⭐ 对于 Reseller 用户，需要查询子用户列表
  const session = await getSession();
  const isReseller = session?.user.role === "reseller";
  let childUserIds: number[] = [];

  if (isReseller && !enforceKeyView) {
    const { findChildrenByParentId } = await import("@/repository/user");
    const children = await findChildrenByParentId(userId);
    childUserIds = children.map((c) => c.id);
    logger.info(
      `[Overview] Reseller ${userId} has ${childUserIds.length} children: ${childUserIds.join(", ")}`
    );
  }

  const usageCollector =
    enforceKeyView && scopedKeyValue
      ? async (period: TimePeriod) => {
          const range = getTimeRangeForPeriod(period);
          return sumKeyCostInTimeRange(
            parseInt(scopedKeyValue, 10),
            range.startTime,
            range.endTime
          );
        }
      : async (period: TimePeriod) => {
          // ⭐ 修复：使用账期周期计算，优先级：用户自定义 > 自然周期
          const range =
            period === "weekly" || period === "monthly"
              ? getTimeRangeForBillingPeriod(period, billingCycleStart)
              : getTimeRangeForPeriod(period);

          // ⭐ 调试日志
          logger.info(
            `[Overview] 计算用户 ${userId} ${period} 消费 - ` +
              `账期起始=${billingCycleStart?.toISOString() ?? "null"}, ` +
              `时间范围=${range.startTime.toISOString()} ~ ${range.endTime.toISOString()}, ` +
              `角色=${isReseller ? "reseller" : "user"}, ` +
              `子用户数=${childUserIds.length}`
          );

          // ⭐ 关键修复：对于 Reseller，使用 sumChildrenCostInTimeRange 包含所有子用户消费
          if (isReseller) {
            const { sumChildrenCostInTimeRange } = await import("@/repository/statistics");
            return sumChildrenCostInTimeRange(userId, childUserIds, range.startTime, range.endTime);
          }

          // 普通用户：只查询自己的消费
          return sumUserCostInTimeRange(userId, range.startTime, range.endTime);
        };

  const limitConfigs: Array<{
    key: PersonalLimitType;
    label: string;
    value?: number | null;
    period?: TimePeriod;
  }> = [
    { key: "5h", label: "5 小时额度", value: source.limit5hUsd, period: "5h" },
    { key: "weekly", label: "周额度", value: source.limitWeeklyUsd, period: "weekly" },
    { key: "monthly", label: "月额度", value: source.limitMonthlyUsd, period: "monthly" },
    { key: "total", label: "套餐额度", value: source.totalLimitUsd, period: "total" },
  ];

  const limitPromises = limitConfigs
    .filter((config) => config.value != null && config.value > 0)
    .map(async (config) => {
      if (!config.period) return null;
      const used = await usageCollector(config.period);

      // 计算重置时间和类型
      let resetAt: Date | undefined;
      let resetType: "natural" | "rolling" | undefined;

      if (config.period === "weekly" || config.period === "monthly") {
        const resetInfo = getResetInfo(config.period);
        resetAt = resetInfo.resetAt;
        resetType = resetInfo.type;
      }

      return {
        key: config.key,
        label: config.label,
        limit: config.value as number,
        used,
        resetAt,
        resetType,
      } as PersonalSpendingLimit;
    });

  // ⭐ 每日限额：插入到最前面
  if (source.dailyLimitUsd && source.dailyLimitUsd > 0) {
    limitPromises.unshift(
      Promise.resolve({
        key: "daily" as const,
        label: "每日额度",
        limit: source.dailyLimitUsd,
        used: todayCost,
        resetAt: getDailyResetTime(),
        resetType: "natural" as const,
      })
    );
  }

  // ⭐ 先解析所有套餐限额（周/月/总）
  const resolved = await Promise.all(limitPromises);
  const validLimits = resolved.filter((item): item is PersonalSpendingLimit => Boolean(item));

  // ⭐ 调试日志：输出所有限额计算结果
  logger.info(
    `[Overview] buildPersonalSpendingLimits 结果 - ` +
      `userId=${userId}, enforceKeyView=${enforceKeyView}, ` +
      `限额数量=${validLimits.length}, ` +
      `详情=${JSON.stringify(validLimits.map((l) => ({ key: l.key, limit: l.limit, used: l.used })))}`
  );

  return validLimits;
}
