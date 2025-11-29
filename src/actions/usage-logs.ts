"use server";

import { getSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  findUsageLogsWithDetails,
  getMonthlyUsageStats,
  getUsedModels,
  getUsedStatusCodes,
  type MonthlyUsageStatsResult,
  type UsageLogFilters,
  type UsageLogsResult,
} from "@/repository/usage-logs";
import type { ActionResult } from "./types";

/**
 * 获取使用日志（根据权限过滤）
 */
export async function getUsageLogs(
  filters: Omit<UsageLogFilters, "userIds"> // ⭐ 允许传递 userId，但不允许 userIds（由后端控制）
): Promise<ActionResult<UsageLogsResult>> {
  try {
    const session = await getSession();
    if (!session) {
      return { ok: false, error: "未登录" };
    }

    const isAdmin = session.user.role === "admin";
    const isReseller = session.user.role === "reseller";

    let finalFilters: UsageLogFilters;

    if (isAdmin) {
      // 管理员：查询所有用户的日志
      finalFilters = { ...filters };
    } else if (isReseller) {
      //  代理用户：可以查询自己 + 所有子用户的日志
      const { findChildrenByParentId } = await import("@/repository/user");
      const children = await findChildrenByParentId(session.user.id);
      const allUserIds = [session.user.id, ...children.map((c) => c.id)];

      logger.info(
        `[UsageLogs] Reseller ${session.user.id} querying usage logs for ${allUserIds.length} users: ${allUserIds.join(", ")}`
      );

      // ⭐ 检查前端是否传递了 userId 参数（用户选择了特定用户筛选）
      const requestedUserId = filters.userId;

      if (requestedUserId !== undefined) {
        // 前端选择了特定用户，检查权限
        if (allUserIds.includes(requestedUserId)) {
          // 有权限查询这个用户，使用单用户查询
          finalFilters = {
            ...filters,
            userId: requestedUserId,
          };
        } else {
          // 无权限查询这个用户，返回空结果
          logger.warn(
            `[UsageLogs] Reseller ${session.user.id} attempted to query unauthorized user ${requestedUserId}`
          );
          finalFilters = {
            ...filters,
            userIds: [], // 空数组，查询结果为空
          };
        }
      } else {
        // 前端未选择特定用户，查询所有允许的用户
        finalFilters = {
          ...filters,
          userIds: allUserIds,
        };
      }
    } else {
      // ⭐ 普通用户：只查询自己的日志
      finalFilters = { ...filters, userId: session.user.id };
    }

    // Key 视图模式：进一步限制为当前 Key
    if (session.viewMode === "key" && session.key) {
      finalFilters = {
        ...finalFilters,
        userId: session.user.id, // Key 模式下强制单用户
        keyId: session.key.id,
      };
    }

    const result = await findUsageLogsWithDetails(finalFilters);

    return { ok: true, data: result };
  } catch (error) {
    logger.error("获取使用日志失败:", error);
    const message = error instanceof Error ? error.message : "获取使用日志失败";
    return { ok: false, error: message };
  }
}

/**
 * 获取模型列表（用于筛选器）
 */
export async function getModelList(): Promise<ActionResult<string[]>> {
  try {
    const session = await getSession();
    if (!session) {
      return { ok: false, error: "未登录" };
    }

    const models = await getUsedModels();
    return { ok: true, data: models };
  } catch (error) {
    logger.error("获取模型列表失败:", error);
    return { ok: false, error: "获取模型列表失败" };
  }
}

/**
 * 获取状态码列表（用于筛选器）
 */
export async function getStatusCodeList(): Promise<ActionResult<number[]>> {
  try {
    const session = await getSession();
    if (!session) {
      return { ok: false, error: "未登录" };
    }

    const codes = await getUsedStatusCodes();
    return { ok: true, data: codes };
  } catch (error) {
    logger.error("获取状态码列表失败:", error);
    return { ok: false, error: "获取状态码列表失败" };
  }
}

/**
 * 获取月度使用统计（按天聚合）
 */
export async function getMonthlyUsageStatsAction(
  month?: string
): Promise<ActionResult<MonthlyUsageStatsResult>> {
  try {
    const session = await getSession();
    if (!session) {
      return { ok: false, error: "未登录" };
    }

    const result = await getMonthlyUsageStats({
      userId: session.user.id,
      month,
      keyId: session.viewMode === "key" && session.key ? session.key.id : undefined,
    });
    return { ok: true, data: result };
  } catch (error) {
    logger.error("获取月度使用统计失败:", error);
    const message = error instanceof Error ? error.message : "获取月度使用统计失败";
    return { ok: false, error: message };
  }
}
