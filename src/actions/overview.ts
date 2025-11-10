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
    dailyLimit?: number | null;
    todayRequests: number;
    todayCost: number;
    favoriteProvider?: string | null;
    favoriteModel?: string | null;
    recentRequests: RecentRequestEntry[];
  };
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
    const scopedKeyValue = enforceKeyView ? session.key.key : undefined;

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
        enforceKeyView
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
      const [preferences, recentRequests] = await Promise.all([
        getUserPreferenceSnapshot(currentUserId, scopedKeyValue),
        getRecentRequestsByUser(currentUserId, 5, scopedKeyValue),
      ]);

      overview.personalSummary = {
        dailyLimit: enforceKeyView ? session.key.dailyLimitUsd : null,
        todayRequests: metricsData.todayRequests,
        todayCost: metricsData.todayCost,
        favoriteProvider: preferences.favoriteProvider,
        favoriteModel: preferences.favoriteModel,
        recentRequests,
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
