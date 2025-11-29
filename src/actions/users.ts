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
import { getTimeRangeForPeriod, getTimeRangeForBillingPeriod } from "@/lib/rate-limit/time-utils";

type GetUsersParam = UsageTimeRangeValue | { timeRange?: UsageTimeRangeValue } | undefined;

// 获取当前登录用户的完整数据（包含 usage 统计）
// 专门用于 Reseller 在创建子用户时显示自己的可用额度
// 对于 Reseller：包含自己 + 所有子用户的消费数据
export async function getCurrentUserWithUsage(params?: GetUsersParam): Promise<UserDisplay | null> {
  try {
    const session = await getSession();
    if (!session) {
      return null;
    }

    // 查询当前用户的原始数据
    const { findUserById, findChildrenByParentId } = await import("@/repository/user");
    const currentUser = await findUserById(session.user.id);
    if (!currentUser) {
      return null;
    }

    // 复用 getUsers 的计算逻辑，构建 UserDisplay
    const now = Date.now();
    const rangeValue = typeof params === "string" ? params : (params?.timeRange ?? "today");
    const rangeBounds = resolveUsageTimeRange(rangeValue);
    const rangeFilter = { start: rangeBounds.start, end: rangeBounds.end };

    try {
      const weeklyRange = getTimeRangeForBillingPeriod("weekly", currentUser.billingCycleStart);
      const monthlyRange = getTimeRangeForBillingPeriod("monthly", currentUser.billingCycleStart);
      const totalRange = getTimeRangeForPeriod("total");

      // ⭐ 对于 Reseller，需要查询所有子用户的消费数据（但不返回子用户的密钥）
      let allUserIds = [currentUser.id];
      if (currentUser.role === "reseller") {
        const children = await findChildrenByParentId(currentUser.id);
        allUserIds = [currentUser.id, ...children.map((c) => c.id)];
        logger.info(
          `[getCurrentUserWithUsage] Reseller ${currentUser.id} has ${children.length} children, querying usage for all users: ${allUserIds.join(", ")}`
        );
      }

      // 1. keys：只查询当前用户自己的密钥（用于显示在 API 密钥页面）
      // 2. usage：查询所有用户的消费（用于计算可用额度）
      const { findKeyUsageForMultipleUsers } = await import("@/repository/key");

      const [
        keys,
        usageRecords,
        keyStatistics,
        weeklyUsageRecords,
        monthlyUsageRecords,
        totalUsageRecords,
      ] = await Promise.all([
        findKeyList(currentUser.id), // ⭐ 只查询当前用户自己的 keys
        findKeyUsageForMultipleUsers(allUserIds, rangeFilter), // ⭐ 查询所有用户的消费
        findKeysWithStatistics(currentUser.id, rangeFilter),
        findKeyUsageForMultipleUsers(allUserIds, {
          start: weeklyRange.startTime,
          end: weeklyRange.endTime,
        }),
        findKeyUsageForMultipleUsers(allUserIds, {
          start: monthlyRange.startTime,
          end: monthlyRange.endTime,
        }),
        findKeyUsageForMultipleUsers(allUserIds, {
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

      // ⭐ 计算用户聚合消费（所有 Key 的消费总和）
      // 对于 Reseller：usageMap 包含自己 + 所有子用户的 keys 消费
      // 直接对 Map 的值求和，而不是遍历 keys 数组（因为 keys 只包含当前用户的密钥）
      const userAggregateWeeklyUsage = Array.from(weeklyUsageMap.values()).reduce(
        (sum, cost) => sum + cost,
        0
      );

      const userAggregateMonthlyUsage = Array.from(monthlyUsageMap.values()).reduce(
        (sum, cost) => sum + cost,
        0
      );

      const userAggregateTotalUsage = Array.from(totalUsageMap.values()).reduce(
        (sum, cost) => sum + cost,
        0
      );

      logger.info(
        `[getCurrentUserWithUsage] User ${currentUser.id} (${currentUser.role}): ` +
          `weekly=${userAggregateWeeklyUsage.toFixed(4)}, ` +
          `monthly=${userAggregateMonthlyUsage.toFixed(4)}, ` +
          `total=${userAggregateTotalUsage.toFixed(4)}, ` +
          `ownKeys=${keys.length}, ` +
          `allUsersCount=${allUserIds.length}`
      );

      const expiresAtIso = currentUser.expiresAt ? currentUser.expiresAt.toISOString() : null;
      const isExpired = Boolean(currentUser.expiresAt && currentUser.expiresAt.getTime() <= now);
      const status: UserDisplay["status"] = !currentUser.isEnabled
        ? "disabled"
        : isExpired
          ? "expired"
          : "active";

      return {
        id: currentUser.id,
        name: currentUser.name,
        note: currentUser.description || undefined,
        role: currentUser.role,
        providerGroup: currentUser.providerGroup || undefined,
        tags: currentUser.tags ?? [],
        isEnabled: currentUser.isEnabled,
        expiresAt: expiresAtIso,
        isExpired,
        status,
        parentUserId: currentUser.parentUserId,
        // Key 管理配置
        maxKeysCount: currentUser.maxKeysCount ?? 3, // ⭐ Key 数量限制
        // 用户级别限额
        limit5hUsd: currentUser.limit5hUsd,
        limitWeeklyUsd: currentUser.limitWeeklyUsd,
        limitMonthlyUsd: currentUser.limitMonthlyUsd,
        totalLimitUsd: currentUser.totalLimitUsd,
        billingCycleStart: currentUser.billingCycleStart,
        balanceUsd: currentUser.balanceUsd,
        balanceUpdatedAt: currentUser.balanceUpdatedAt,
        balanceUsagePolicy: currentUser.balanceUsagePolicy, // ⭐ 余额使用策略
        // ⭐ 关键：用户聚合消费数据（Reseller 包含自己 + 所有子用户）
        userAggregateWeeklyUsage,
        userAggregateMonthlyUsage,
        userAggregateTotalUsage,
        keys: keys.map((key) => {
          const stats = statisticsMap.get(key.id);
          const canUserManageKey = true; // 用户可以管理自己的 Key
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
            limit5hUsd: key.limit5hUsd,
            limitWeeklyUsd: key.limitWeeklyUsd,
            limitMonthlyUsd: key.limitMonthlyUsd,
            totalLimitUsd: key.totalLimitUsd,
            limitConcurrentSessions: key.limitConcurrentSessions || 0,
          };
        }),
      };
    } catch (error) {
      logger.error(`获取当前用户 ${session.user.id} 的完整数据失败:`, error);
      return null;
    }
  } catch (error) {
    logger.error("获取当前用户完整数据失败:", error);
    return null;
  }
}

// 获取用户数据
export async function getUsers(params?: GetUsersParam): Promise<UserDisplay[]> {
  try {
    const session = await getSession();
    if (!session) {
      return [];
    }

    // 根据角色过滤用户数据
    let users;
    if (session.user.role === "user") {
      // 普通用户只能看到自己，从数据库获取完整数据
      const allUsers = await findUserList();
      const self = allUsers.find((u) => u.id === session.user.id);
      users = self ? [self] : [];
    } else if (session.user.role === "reseller") {
      // ⭐ 代理用户在用户管理页面只能看到自己创建的子用户，不能看到自己
      // 代理用户管理自己的账户应该通过"账户设置"等其他页面
      const allUsers = await findUserList();
      const children = allUsers.filter((u) => u.parentUserId === session.user.id);
      users = children; // 只返回子用户，不包含自己
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
          // 使用用户的账期起始日期计算周期范围，没有设置则回退到自然周期
          const weeklyRange = getTimeRangeForBillingPeriod("weekly", user.billingCycleStart);
          const monthlyRange = getTimeRangeForBillingPeriod("monthly", user.billingCycleStart);
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
            parentUserId: user.parentUserId, // 添加父用户ID用于权限判断
            // Key 管理配置
            maxKeysCount: user.maxKeysCount ?? 3, //  Key 数量限制
            // 用户级别限额
            limit5hUsd: user.limit5hUsd,
            limitWeeklyUsd: user.limitWeeklyUsd,
            limitMonthlyUsd: user.limitMonthlyUsd,
            totalLimitUsd: user.totalLimitUsd,
            // 账期周期配置
            billingCycleStart: user.billingCycleStart,
            // 余额字段
            balanceUsd: user.balanceUsd,
            balanceUpdatedAt: user.balanceUpdatedAt,
            balanceUsagePolicy: user.balanceUsagePolicy, //
            // 余额使用策略
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
            parentUserId: user.parentUserId, // ⭐ 添加父用户ID用于权限判断
            maxKeysCount: user.maxKeysCount ?? 3, // ⭐ Key 数量限制
            billingCycleStart: user.billingCycleStart,
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
  role?: "admin" | "reseller" | "user";
  providerGroup?: string | null;
  tags?: string[];
  expiresAt?: string | null;
  isEnabled?: boolean;
  // 用户级别限额字段
  limit5hUsd?: number | null;
  limitWeeklyUsd?: number | null;
  limitMonthlyUsd?: number | null;
  totalLimitUsd?: number | null;
  // Key 管理配置
  maxKeysCount?: number;
  // 账期周期配置
  billingCycleStart?: string | null;
  // 余额使用策略
  balanceUsagePolicy?: "disabled" | "after_quota" | "priority";
}): Promise<ActionResult<{ password: string }>> {
  try {
    // ========== 权限检查：Admin 和 Reseller 可以创建用户 ==========
    const session = await getSession();
    if (!session) {
      return { ok: false, error: "未登录" } as const;
    }

    const currentUserRole = session.user.role;
    const currentUserId = session.user.id;
    const requestedRole = data.role ?? "user"; // 默认创建普通用户

    // 1. User 角色不能创建任何用户
    if (currentUserRole === "user") {
      return { ok: false, error: "普通用户无权创建其他用户" } as const;
    }

    // 2. Reseller 只能创建 User 角色
    if (currentUserRole === "reseller" && requestedRole !== "user") {
      return {
        ok: false,
        error: "代理用户只能创建普通用户，不能创建管理员或代理用户",
      } as const;
    }

    // 3. Admin 可以创建 Reseller 和 User
    if (currentUserRole === "admin" && requestedRole === "admin") {
      return {
        ok: false,
        error: "不允许创建管理员账户，请联系系统管理员",
      } as const;
    }

    // ========== 4. Reseller 限额校验：子用户限额不能超过父用户总可用额度 ==========
    // 总可用额度 = (套餐限额 - 已使用) + 余额
    if (currentUserRole === "reseller") {
      // 查询 Reseller 的完整数据（包含 usage 统计）
      const resellerUserWithUsage = await getCurrentUserWithUsage("today");

      if (resellerUserWithUsage) {
        const errors: string[] = [];

        // 计算 Reseller 的总可用额度
        const resellerAvailableLimits = {
          // 5小时：原始限额（无实时 usage 数据）
          limit5hUsd: resellerUserWithUsage.limit5hUsd ?? null,
          // 周限额：套餐剩余 + 余额
          limitWeeklyUsd:
            resellerUserWithUsage.limitWeeklyUsd != null
              ? Math.max(
                  0,
                  resellerUserWithUsage.limitWeeklyUsd -
                    (resellerUserWithUsage.userAggregateWeeklyUsage ?? 0)
                ) + (resellerUserWithUsage.balanceUsd ?? 0)
              : (resellerUserWithUsage.balanceUsd ?? 0) || null,
          // 月限额：套餐剩余 + 余额
          limitMonthlyUsd:
            resellerUserWithUsage.limitMonthlyUsd != null
              ? Math.max(
                  0,
                  resellerUserWithUsage.limitMonthlyUsd -
                    (resellerUserWithUsage.userAggregateMonthlyUsage ?? 0)
                ) + (resellerUserWithUsage.balanceUsd ?? 0)
              : (resellerUserWithUsage.balanceUsd ?? 0) || null,
          // 总限额：套餐剩余 + 余额
          totalLimitUsd:
            resellerUserWithUsage.totalLimitUsd != null
              ? Math.max(
                  0,
                  resellerUserWithUsage.totalLimitUsd -
                    (resellerUserWithUsage.userAggregateTotalUsage ?? 0)
                ) + (resellerUserWithUsage.balanceUsd ?? 0)
              : (resellerUserWithUsage.balanceUsd ?? 0) || null,
        };

        // 校验 5 小时限额
        if (
          data.limit5hUsd != null &&
          resellerAvailableLimits.limit5hUsd != null &&
          data.limit5hUsd > resellerAvailableLimits.limit5hUsd
        ) {
          errors.push(
            `5小时限额 $${data.limit5hUsd} 超过了您的总可用额度 $${resellerAvailableLimits.limit5hUsd.toFixed(2)}`
          );
        }

        // 校验周限额
        if (
          data.limitWeeklyUsd != null &&
          resellerAvailableLimits.limitWeeklyUsd != null &&
          data.limitWeeklyUsd > resellerAvailableLimits.limitWeeklyUsd
        ) {
          errors.push(
            `周限额 $${data.limitWeeklyUsd} 超过了您的总可用额度 $${resellerAvailableLimits.limitWeeklyUsd.toFixed(2)}（套餐剩余 + 余额）`
          );
        }

        // 校验月限额
        if (
          data.limitMonthlyUsd != null &&
          resellerAvailableLimits.limitMonthlyUsd != null &&
          data.limitMonthlyUsd > resellerAvailableLimits.limitMonthlyUsd
        ) {
          errors.push(
            `月限额 $${data.limitMonthlyUsd} 超过了您的总可用额度 $${resellerAvailableLimits.limitMonthlyUsd.toFixed(2)}（套餐剩余 + 余额）`
          );
        }

        // 校验总限额
        if (
          data.totalLimitUsd != null &&
          resellerAvailableLimits.totalLimitUsd != null &&
          data.totalLimitUsd > resellerAvailableLimits.totalLimitUsd
        ) {
          errors.push(
            `总限额 $${data.totalLimitUsd} 超过了您的总可用额度 $${resellerAvailableLimits.totalLimitUsd.toFixed(2)}（套餐剩余 + 余额）`
          );
        }

        // 如果有错误，返回错误信息
        if (errors.length > 0) {
          return {
            ok: false,
            error: `限额校验失败：${errors.join("；")}`,
          } as const;
        }
      }
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
      billingCycleStart: data.billingCycleStart ?? null,
      balanceUsagePolicy: data.balanceUsagePolicy, // ⭐ 余额使用策略
    });

    const normalizedTags = Array.from(
      new Set((validatedData.tags ?? []).map((tag) => tag.trim()).filter(Boolean))
    );
    const expiresAtDate =
      validatedData.expiresAt && typeof validatedData.expiresAt === "string"
        ? new Date(validatedData.expiresAt)
        : null;

    // 账期起始日期转换
    const billingCycleStartDate =
      validatedData.billingCycleStart && typeof validatedData.billingCycleStart === "string"
        ? new Date(validatedData.billingCycleStart)
        : null;

    // ========== 生成随机密码（8位字符，不含易混淆字符） ==========
    const { generateRandomPassword, hashPassword } = await import("@/lib/auth");
    const randomPassword = generateRandomPassword();
    const passwordHash = await hashPassword(randomPassword);

    // ========== 创建用户（自动设置 parentUserId） ==========
    const newUser = await createUser({
      name: validatedData.name,
      description: validatedData.note || "",
      role: requestedRole, // 设置角色
      providerGroup: validatedData.providerGroup || null,
      tags: normalizedTags,
      expiresAt: expiresAtDate,
      isEnabled: validatedData.isEnabled,
      // 父子关系配置：Reseller 创建时自动设置 parentUserId
      parentUserId: currentUserRole === "reseller" ? currentUserId : null,
      // 密码认证配置
      passwordHash,
      passwordUpdatedAt: new Date(),
      forcePasswordChange: false, // 首次登录不强制修改密码
      // Key 管理配置
      maxKeysCount: data.maxKeysCount ?? 3, // 使用传入的值，默认 3
      // 限额配置
      limit5hUsd: validatedData.limit5hUsd,
      limitWeeklyUsd: validatedData.limitWeeklyUsd,
      limitMonthlyUsd: validatedData.limitMonthlyUsd,
      totalLimitUsd: validatedData.totalLimitUsd,
      // 额度共享配置：子用户默认继承父用户限额
      inheritParentLimits: currentUserRole === "reseller" ? true : true,
      // 账期周期配置
      billingCycleStart: billingCycleStartDate,
      // 余额使用策略
      balanceUsagePolicy: validatedData.balanceUsagePolicy,
    });

    logger.info(
      `[User] User created: id=${newUser.id}, name=${newUser.name}, role=${requestedRole}, ` +
        `creator=${currentUserId} (${currentUserRole}), parentUserId=${newUser.parentUserId}`
    );

    // ⭐ 不再自动创建 Key，用户需要自己登录后创建

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/clients");
    return { ok: true, data: { password: randomPassword } }; // 返回随机密码给创建者
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
    // Key 管理配置
    maxKeysCount?: number;
    // 账期周期配置
    billingCycleStart?: string | null;
    // 余额使用策略
    balanceUsagePolicy?: "disabled" | "after_quota" | "priority";
  }
): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) {
      return { ok: false, error: "未登录" };
    }

    const currentUserRole = session.user.role;
    const currentUserId = session.user.id;

    // 权限检查：
    // 1. Admin 可以编辑所有用户
    // 2. Reseller 可以编辑自己和自己创建的子用户
    if (currentUserRole === "user") {
      return { ok: false, error: "普通用户无权编辑用户信息" };
    }

    // 如果是 Reseller，需要检查是否有权限编辑目标用户
    if (currentUserRole === "reseller") {
      const { findUserById } = await import("@/repository/user");
      const targetUser = await findUserById(userId);

      if (!targetUser) {
        return { ok: false, error: "目标用户不存在" };
      }

      // Reseller 只能编辑自己或自己创建的子用户
      if (targetUser.id !== currentUserId && targetUser.parentUserId !== currentUserId) {
        return { ok: false, error: "代理用户只能编辑自己和自己创建的用户" };
      }
    }

    const validatedData = UpdateUserSchema.parse(data);

    // ========== Reseller 限额校验：编辑子用户时，限额不能超过父用户总可用额度 ==========
    // 总可用额度 = (套餐限额 - 已使用) + 余额
    if (currentUserRole === "reseller") {
      // 查询 Reseller 的完整数据（包含 usage 统计）
      const resellerUserWithUsage = await getCurrentUserWithUsage("today");

      if (resellerUserWithUsage) {
        const errors: string[] = [];

        // 计算 Reseller 的总可用额度
        const resellerAvailableLimits = {
          // 5小时：原始限额（无实时 usage 数据）
          limit5hUsd: resellerUserWithUsage.limit5hUsd ?? null,
          // 周限额：套餐剩余 + 余额
          limitWeeklyUsd:
            resellerUserWithUsage.limitWeeklyUsd != null
              ? Math.max(
                  0,
                  resellerUserWithUsage.limitWeeklyUsd -
                    (resellerUserWithUsage.userAggregateWeeklyUsage ?? 0)
                ) + (resellerUserWithUsage.balanceUsd ?? 0)
              : (resellerUserWithUsage.balanceUsd ?? 0) || null,
          // 月限额：套餐剩余 + 余额
          limitMonthlyUsd:
            resellerUserWithUsage.limitMonthlyUsd != null
              ? Math.max(
                  0,
                  resellerUserWithUsage.limitMonthlyUsd -
                    (resellerUserWithUsage.userAggregateMonthlyUsage ?? 0)
                ) + (resellerUserWithUsage.balanceUsd ?? 0)
              : (resellerUserWithUsage.balanceUsd ?? 0) || null,
          // 总限额：套餐剩余 + 余额
          totalLimitUsd:
            resellerUserWithUsage.totalLimitUsd != null
              ? Math.max(
                  0,
                  resellerUserWithUsage.totalLimitUsd -
                    (resellerUserWithUsage.userAggregateTotalUsage ?? 0)
                ) + (resellerUserWithUsage.balanceUsd ?? 0)
              : (resellerUserWithUsage.balanceUsd ?? 0) || null,
        };

        // 校验 5 小时限额
        if (
          validatedData.limit5hUsd != null &&
          resellerAvailableLimits.limit5hUsd != null &&
          validatedData.limit5hUsd > resellerAvailableLimits.limit5hUsd
        ) {
          errors.push(
            `5小时限额 $${validatedData.limit5hUsd} 超过了您的总可用额度 $${resellerAvailableLimits.limit5hUsd.toFixed(2)}`
          );
        }

        // 校验周限额
        if (
          validatedData.limitWeeklyUsd != null &&
          resellerAvailableLimits.limitWeeklyUsd != null &&
          validatedData.limitWeeklyUsd > resellerAvailableLimits.limitWeeklyUsd
        ) {
          errors.push(
            `周限额 $${validatedData.limitWeeklyUsd} 超过了您的总可用额度 $${resellerAvailableLimits.limitWeeklyUsd.toFixed(2)}（套餐剩余 + 余额）`
          );
        }

        // 校验月限额
        if (
          validatedData.limitMonthlyUsd != null &&
          resellerAvailableLimits.limitMonthlyUsd != null &&
          validatedData.limitMonthlyUsd > resellerAvailableLimits.limitMonthlyUsd
        ) {
          errors.push(
            `月限额 $${validatedData.limitMonthlyUsd} 超过了您的总可用额度 $${resellerAvailableLimits.limitMonthlyUsd.toFixed(2)}（套餐剩余 + 余额）`
          );
        }

        // 校验总限额
        if (
          validatedData.totalLimitUsd != null &&
          resellerAvailableLimits.totalLimitUsd != null &&
          validatedData.totalLimitUsd > resellerAvailableLimits.totalLimitUsd
        ) {
          errors.push(
            `总限额 $${validatedData.totalLimitUsd} 超过了您的总可用额度 $${resellerAvailableLimits.totalLimitUsd.toFixed(2)}（套餐剩余 + 余额）`
          );
        }

        // 如果有错误，返回错误信息
        if (errors.length > 0) {
          return {
            ok: false,
            error: `限额校验失败：${errors.join("；")}`,
          };
        }
      }
    }

    const normalizedTags =
      validatedData.tags === undefined
        ? undefined
        : Array.from(new Set(validatedData.tags.map((tag) => tag.trim()).filter(Boolean)));

    let expiresAtValue: Date | null | undefined = undefined;
    if (validatedData.expiresAt !== undefined) {
      expiresAtValue = validatedData.expiresAt ? new Date(validatedData.expiresAt) : null;
    }

    // 账期起始日期转换
    let billingCycleStartValue: Date | null | undefined = undefined;
    if (validatedData.billingCycleStart !== undefined) {
      billingCycleStartValue = validatedData.billingCycleStart
        ? new Date(validatedData.billingCycleStart)
        : null;
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
      maxKeysCount: validatedData.maxKeysCount,
      billingCycleStart: billingCycleStartValue,
      balanceUsagePolicy: validatedData.balanceUsagePolicy, // ⭐ 余额使用策略
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
    if (!session) {
      return { ok: false, error: "未登录" };
    }

    const currentUserRole = session.user.role;
    const currentUserId = session.user.id;

    // 权限检查：
    // 1. Admin 可以删除所有非 Admin 用户
    // 2. Reseller 可以删除自己创建的子用户（但不能删除自己）
    if (currentUserRole === "user") {
      return { ok: false, error: "普通用户无权删除用户" };
    }

    const { findUserById } = await import("@/repository/user");
    const targetUser = await findUserById(userId);

    if (!targetUser) {
      return { ok: false, error: "目标用户不存在" };
    }

    // Reseller 权限检查
    if (currentUserRole === "reseller") {
      // Reseller 不能删除自己
      if (targetUser.id === currentUserId) {
        return { ok: false, error: "不能删除自己" };
      }

      // Reseller 只能删除自己创建的子用户
      if (targetUser.parentUserId !== currentUserId) {
        return { ok: false, error: "代理用户只能删除自己创建的用户" };
      }
    }

    // Admin 权限检查
    if (currentUserRole === "admin") {
      // Admin 不能删除其他 Admin
      if (targetUser.role === "admin") {
        return { ok: false, error: "不允许删除管理员账户" };
      }
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
    if (!session) {
      return { ok: false, error: "未登录" };
    }

    const currentUserRole = session.user.role;
    const currentUserId = session.user.id;

    // 权限检查：
    // 1. Admin 可以启用/禁用所有用户
    // 2. Reseller 可以启用/禁用自己创建的子用户（但不能禁用自己）
    if (currentUserRole === "user") {
      return { ok: false, error: "普通用户无权修改用户状态" };
    }

    const { findUserById } = await import("@/repository/user");
    const targetUser = await findUserById(userId);

    if (!targetUser) {
      return { ok: false, error: "目标用户不存在" };
    }

    // Reseller 权限检查
    if (currentUserRole === "reseller") {
      // Reseller 不能禁用自己
      if (targetUser.id === currentUserId && !enabled) {
        return { ok: false, error: "不能禁用自己" };
      }

      // Reseller 只能管理自己创建的子用户
      if (targetUser.id !== currentUserId && targetUser.parentUserId !== currentUserId) {
        return { ok: false, error: "代理用户只能管理自己和自己创建的用户" };
      }
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

// 修改密码
export async function changePassword(data: {
  oldPassword: string;
  newPassword: string;
}): Promise<ActionResult> {
  try {
    // 1. 获取当前登录用户
    const session = await getSession();
    if (!session) {
      return { ok: false, error: "未登录" };
    }

    const userId = session.user.id;

    // 2. 验证输入
    if (!data.oldPassword || !data.newPassword) {
      return { ok: false, error: "密码不能为空" };
    }

    if (data.newPassword.length < 6) {
      return { ok: false, error: "新密码长度不能少于 6 位" };
    }

    if (data.oldPassword === data.newPassword) {
      return { ok: false, error: "新密码不能与旧密码相同" };
    }

    // 3. 验证旧密码
    const { validatePassword, hashPassword } = await import("@/lib/auth");
    const { findUserById } = await import("@/repository/user");

    const user = await findUserById(userId);
    if (!user) {
      return { ok: false, error: "用户不存在" };
    }

    // 验证旧密码（通过用户名和旧密码验证）
    const validSession = await validatePassword(user.name, data.oldPassword);
    if (!validSession) {
      return { ok: false, error: "旧密码错误" };
    }

    // 4. 更新密码
    const newPasswordHash = await hashPassword(data.newPassword);
    await updateUser(userId, {
      passwordHash: newPasswordHash,
      passwordUpdatedAt: new Date(),
      forcePasswordChange: false, // 修改密码后清除强制修改标记
    });

    logger.info(`[User] Password changed: userId=${userId}, name=${user.name}`);

    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    logger.error("修改密码失败:", error);
    const message = error instanceof Error ? error.message : "修改密码失败，请稍后重试";
    return { ok: false, error: message };
  }
}

// 重置用户密码（管理员/代理）
export async function resetUserPassword(
  userId: number
): Promise<ActionResult<{ password: string }>> {
  try {
    // 1. 权限检查
    const session = await getSession();
    if (!session) {
      return { ok: false, error: "未登录" };
    }

    const currentUserRole = session.user.role;
    const currentUserId = session.user.id;

    // User 角色不能重置任何人的密码
    if (currentUserRole === "user") {
      return { ok: false, error: "普通用户无权重置密码" };
    }

    // 2. 获取目标用户信息
    const { findUserById } = await import("@/repository/user");
    const targetUser = await findUserById(userId);

    if (!targetUser) {
      return { ok: false, error: "目标用户不存在" };
    }

    // 3. 检查父子关系权限
    // Reseller 可以重置自己的密码或子用户的密码
    if (currentUserRole === "reseller") {
      // 不是自己，也不是子用户
      if (targetUser.id !== currentUserId && targetUser.parentUserId !== currentUserId) {
        return {
          ok: false,
          error: "代理用户只能重置自己和自己创建的用户密码",
        };
      }
    }

    // Admin 可以重置所有非 Admin 用户的密码
    if (currentUserRole === "admin" && targetUser.role === "admin") {
      return {
        ok: false,
        error: "不允许重置管理员账户密码",
      };
    }

    // 4. 生成新密码
    const { generateRandomPassword, hashPassword } = await import("@/lib/auth");
    const randomPassword = generateRandomPassword();
    const passwordHash = await hashPassword(randomPassword);

    // 5. 更新密码
    await updateUser(userId, {
      passwordHash,
      passwordUpdatedAt: new Date(),
      forcePasswordChange: false,
    });

    logger.info(
      `[User] Password reset: userId=${userId}, name=${targetUser.name}, ` +
        `resetBy=${currentUserId} (${currentUserRole})`
    );

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/clients");
    return { ok: true, data: { password: randomPassword } };
  } catch (error) {
    logger.error("重置密码失败:", error);
    const message = error instanceof Error ? error.message : "重置密码失败，请稍后重试";
    return { ok: false, error: message };
  }
}
