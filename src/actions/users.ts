"use server";

import { findUserList, createUser, updateUser, deleteUser } from "@/repository/user";
import { logger } from "@/lib/logger";
import { findKeyList, findKeyUsageInRange, findKeysWithStatistics } from "@/repository/key";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { type UserDisplay } from "@/types/user";
import { maskKey } from "@/lib/utils/validation";
import { CreateUserSchema, UpdateUserSchema } from "@/lib/validation/schemas";
import { KEY_DEFAULTS } from "@/lib/constants/key.constants";
import { createKey } from "@/repository/key";
import { getSession } from "@/lib/auth";
import type { ActionResult } from "./types";
import { UsageTimeRangeValue, resolveUsageTimeRange } from "@/lib/time-range";
import { getTimeRangeForPeriod } from "@/lib/rate-limit/time-utils";

type GetUsersParam = UsageTimeRangeValue | { timeRange?: UsageTimeRangeValue } | undefined;

// 获取用户数据
export async function getUsers(params?: GetUsersParam): Promise<UserDisplay[]> {
  try {
    const session = await getSession();
    if (!session) {
      return [];
    }

    // 普通用户只能看到自己的数据
    let users;
    if (session.user.role === "user") {
      users = [session.user]; // 只返回当前用户
    } else {
      users = await findUserList(); // 管理员可以看到所有用户
    }

    if (users.length === 0) {
      return [];
    }

    // 管理员可以看到完整Key，普通用户只能看到掩码
    const isAdmin = session.user.role === "admin";
    const hasOwnerView = session.viewMode === "user";

    const now = Date.now();

    const rangeValue = typeof params === "string" ? params : (params?.timeRange ?? "today");
    const rangeBounds = resolveUsageTimeRange(rangeValue);
    const rangeFilter = { start: rangeBounds.start, end: rangeBounds.end };

    const userDisplays: UserDisplay[] = await Promise.all(
      users.map(async (user) => {
        try {
          const weeklyRange = getTimeRangeForPeriod("weekly");
          const monthlyRange = getTimeRangeForPeriod("monthly");
          const totalRange = getTimeRangeForPeriod("total");

          const [
            keys,
            usageRecords,
            keyStatistics,
            weeklyUsageRecords,
            monthlyUsageRecords,
            totalUsageRecords,
          ] = await Promise.all([
            findKeyList(user.id),
            findKeyUsageInRange(user.id, rangeFilter),
            findKeysWithStatistics(user.id, rangeFilter),
            findKeyUsageInRange(user.id, {
              start: weeklyRange.startTime,
              end: weeklyRange.endTime,
            }),
            findKeyUsageInRange(user.id, {
              start: monthlyRange.startTime,
              end: monthlyRange.endTime,
            }),
            findKeyUsageInRange(user.id, {
              start: totalRange.startTime,
              end: totalRange.endTime,
            }),
          ]);

          const usageMap = new Map(usageRecords.map((item) => [item.keyId, item.totalCost ?? 0]));
          const weeklyUsageMap = new Map(
            weeklyUsageRecords.map((item) => [item.keyId, item.totalCost ?? 0])
          );
          const monthlyUsageMap = new Map(
            monthlyUsageRecords.map((item) => [item.keyId, item.totalCost ?? 0])
          );
          const totalUsageMap = new Map(
            totalUsageRecords.map((item) => [item.keyId, item.totalCost ?? 0])
          );
          const statisticsMap = new Map(keyStatistics.map((stat) => [stat.keyId, stat]));
          const canManageThisUser = isAdmin || (hasOwnerView && session.user.id === user.id);

          // 计算用户聚合消费（所有 Key 的消费总和）
          const userAggregateWeeklyUsage = keys.reduce((sum, key) => {
            return sum + (weeklyUsageMap.get(key.id) ?? 0);
          }, 0);

          const userAggregateMonthlyUsage = keys.reduce((sum, key) => {
            return sum + (monthlyUsageMap.get(key.id) ?? 0);
          }, 0);

          const userAggregateTotalUsage = keys.reduce((sum, key) => {
            return sum + (totalUsageMap.get(key.id) ?? 0);
          }, 0);

          const expiresAtIso = user.expiresAt ? user.expiresAt.toISOString() : null;
          const isExpired = Boolean(user.expiresAt && user.expiresAt.getTime() <= now);
          const status: UserDisplay["status"] = !user.isEnabled
            ? "disabled"
            : isExpired
              ? "expired"
              : "active";

          return {
            id: user.id,
            name: user.name,
            note: user.description || undefined,
            role: user.role,
            providerGroup: user.providerGroup || undefined,
            tags: user.tags ?? [],
            isEnabled: user.isEnabled,
            expiresAt: expiresAtIso,
            isExpired,
            status,
            // 用户级别限额
            limit5hUsd: user.limit5hUsd,
            limitWeeklyUsd: user.limitWeeklyUsd,
            limitMonthlyUsd: user.limitMonthlyUsd,
            totalLimitUsd: user.totalLimitUsd,
            // 用户聚合消费数据
            userAggregateWeeklyUsage,
            userAggregateMonthlyUsage,
            userAggregateTotalUsage,
            keys: keys.map((key) => {
              const stats = statisticsMap.get(key.id);
              const canUserManageKey = canManageThisUser;
              const disabledReason = !key.isEnabled
                ? ("key_disabled" as const)
                : status === "disabled"
                  ? ("user_disabled" as const)
                  : status === "expired"
                    ? ("user_expired" as const)
                    : undefined;
              const effectiveStatus = disabledReason ? "disabled" : ("enabled" as const);

              return {
                id: key.id,
                name: key.name,
                maskedKey: maskKey(key.key),
                fullKey: canUserManageKey ? key.key : undefined,
                canCopy: canUserManageKey,
                canManage: canUserManageKey,
                expiresAt: key.expiresAt ? key.expiresAt.toISOString().split("T")[0] : "永不过期",
                status: effectiveStatus,
                disabledReason,
                createdAt: key.createdAt,
                createdAtFormatted: key.createdAt.toLocaleString("zh-CN", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }),
                todayUsage: usageMap.get(key.id) ?? 0,
                weeklyUsageUsd: weeklyUsageMap.get(key.id) ?? 0,
                monthlyUsageUsd: monthlyUsageMap.get(key.id) ?? 0,
                totalUsageUsd: totalUsageMap.get(key.id) ?? 0,
                todayCallCount: stats?.todayCallCount ?? 0,
                lastUsedAt: stats?.lastUsedAt ?? null,
                lastProviderName: stats?.lastProviderName ?? null,
                modelStats: stats?.modelStats ?? [],
                rpmLimit: key.rpmLimit,
                dailyQuota: key.dailyLimitUsd,
                canLoginWebUi: key.canLoginWebUi,
                scope: key.scope,
                ownerKeyId: key.ownerKeyId,
                limit5hUsd: key.limit5hUsd,
                limitWeeklyUsd: key.limitWeeklyUsd,
                limitMonthlyUsd: key.limitMonthlyUsd,
                totalLimitUsd: key.totalLimitUsd,
                limitConcurrentSessions: key.limitConcurrentSessions || 0,
              };
            }),
          };
        } catch (error) {
          logger.error(`获取用户 ${user.id} 的密钥失败:`, error);
          const expiresAtIso = user.expiresAt ? user.expiresAt.toISOString() : null;
          const isExpired = Boolean(user.expiresAt && user.expiresAt.getTime() <= now);
          return {
            id: user.id,
            name: user.name,
            note: user.description || undefined,
            role: user.role,
            providerGroup: user.providerGroup || undefined,
            tags: user.tags ?? [],
            isEnabled: user.isEnabled,
            expiresAt: expiresAtIso,
            isExpired,
            status: !user.isEnabled ? "disabled" : isExpired ? "expired" : "active",
            keys: [],
          };
        }
      })
    );

    return userDisplays;
  } catch (error) {
    logger.error("获取用户数据失败:", error);
    return [];
  }
}

// 添加用户
export async function addUser(data: {
  name: string;
  note?: string;
  providerGroup?: string | null;
  tags?: string[];
  expiresAt?: string | null;
  isEnabled?: boolean;
  // 用户级别限额字段
  limit5hUsd?: number | null;
  limitWeeklyUsd?: number | null;
  limitMonthlyUsd?: number | null;
  totalLimitUsd?: number | null;
}): Promise<ActionResult> {
  try {
    // 权限检查：只有管理员可以添加用户
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return { ok: false, error: "无权限执行此操作" } as const;
    }

    const validatedData = CreateUserSchema.parse({
      name: data.name,
      note: data.note || "",
      providerGroup: data.providerGroup || "",
      tags: data.tags ?? [],
      expiresAt: data.expiresAt ?? null,
      isEnabled: data.isEnabled ?? true,
      limit5hUsd: data.limit5hUsd,
      limitWeeklyUsd: data.limitWeeklyUsd,
      limitMonthlyUsd: data.limitMonthlyUsd,
      totalLimitUsd: data.totalLimitUsd,
    });

    const normalizedTags = Array.from(
      new Set((validatedData.tags ?? []).map((tag) => tag.trim()).filter(Boolean))
    );
    const expiresAtDate =
      validatedData.expiresAt && typeof validatedData.expiresAt === "string"
        ? new Date(validatedData.expiresAt)
        : null;

    const newUser = await createUser({
      name: validatedData.name,
      description: validatedData.note || "",
      providerGroup: validatedData.providerGroup || null,
      tags: normalizedTags,
      expiresAt: expiresAtDate,
      isEnabled: validatedData.isEnabled,
      limit5hUsd: validatedData.limit5hUsd,
      limitWeeklyUsd: validatedData.limitWeeklyUsd,
      limitMonthlyUsd: validatedData.limitMonthlyUsd,
      totalLimitUsd: validatedData.totalLimitUsd,
    });

    // 为新用户创建默认密钥（使用用户名称作为 Key 名称）
    const generatedKey = "sk-" + randomBytes(16).toString("hex");
    await createKey({
      user_id: newUser.id,
      name: validatedData.name,
      key: generatedKey,
      is_enabled: validatedData.isEnabled ?? true,
      expires_at: undefined,
      scope: "owner",
      rpm_limit: KEY_DEFAULTS.RPM,
      daily_limit_usd: KEY_DEFAULTS.DAILY_QUOTA,
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/clients");
    return { ok: true };
  } catch (error) {
    logger.error("添加用户失败:", error);
    const message = error instanceof Error ? error.message : "添加用户失败，请稍后重试";
    return { ok: false, error: message };
  }
}

// 更新用户
export async function editUser(
  userId: number,
  data: {
    name?: string;
    note?: string;
    providerGroup?: string | null;
    tags?: string[];
    expiresAt?: string | null;
    isEnabled?: boolean;
    // 用户级别限额字段
    limit5hUsd?: number | null;
    limitWeeklyUsd?: number | null;
    limitMonthlyUsd?: number | null;
    totalLimitUsd?: number | null;
  }
): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return { ok: false, error: "无权限执行此操作" };
    }

    const validatedData = UpdateUserSchema.parse(data);

    const normalizedTags =
      validatedData.tags === undefined
        ? undefined
        : Array.from(new Set(validatedData.tags.map((tag) => tag.trim()).filter(Boolean)));

    let expiresAtValue: Date | null | undefined = undefined;
    if (validatedData.expiresAt !== undefined) {
      expiresAtValue = validatedData.expiresAt ? new Date(validatedData.expiresAt) : null;
    }

    await updateUser(userId, {
      name: validatedData.name,
      description: validatedData.note,
      providerGroup: validatedData.providerGroup,
      tags: normalizedTags,
      expiresAt: expiresAtValue,
      isEnabled: validatedData.isEnabled,
      limit5hUsd: validatedData.limit5hUsd,
      limitWeeklyUsd: validatedData.limitWeeklyUsd,
      limitMonthlyUsd: validatedData.limitMonthlyUsd,
      totalLimitUsd: validatedData.totalLimitUsd,
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/clients");
    return { ok: true };
  } catch (error) {
    logger.error("更新用户失败:", error);
    const message = error instanceof Error ? error.message : "更新用户失败，请稍后重试";
    return { ok: false, error: message };
  }
}

// 删除用户
export async function removeUser(userId: number): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return { ok: false, error: "无权限执行此操作" };
    }

    await deleteUser(userId);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/clients");
    return { ok: true };
  } catch (error) {
    logger.error("删除用户失败:", error);
    const message = error instanceof Error ? error.message : "删除用户失败，请稍后重试";
    return { ok: false, error: message };
  }
}

export async function setUserStatus(
  userId: number,
  enabled: boolean
): Promise<ActionResult<{ status: "active" | "disabled" }>> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return { ok: false, error: "无权限执行此操作" };
    }

    await updateUser(userId, { isEnabled: enabled });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/clients");
    return { ok: true, data: { status: enabled ? "active" : "disabled" } };
  } catch (error) {
    logger.error("更新用户状态失败:", error);
    const message = error instanceof Error ? error.message : "更新用户状态失败";
    return { ok: false, error: message };
  }
}
