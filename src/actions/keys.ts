"use server";

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { randomBytes } from "node:crypto";
import { KeyFormSchema } from "@/lib/validation/schemas";
import {
  createKey,
  updateKey,
  deleteKey,
  findActiveKeyByUserIdAndName,
  findKeyById,
  countActiveKeysByUser,
  findKeysWithStatistics,
  findKeyList,
} from "@/repository/key";
import { getSession } from "@/lib/auth";
import type { ActionResult } from "./types";
import type { KeyStatistics } from "@/repository/key";
import type { Key } from "@/types/key";
import { encryptKey } from "@/lib/crypto";

// 添加密钥
export async function addKey(data: {
  userId: number;
  name: string;
  expiresAt?: string;
  canLoginWebUi?: boolean;
  // 独立限额
  limit5hUsd?: number | null;
  limitWeeklyUsd?: number | null;
  limitMonthlyUsd?: number | null;
  totalLimitUsd?: number | null;
  limitConcurrentSessions?: number;
  rpmLimit?: number | null;
  dailyQuota?: number | null;
  // 账期周期配置
  billingCycleStart?: string | null;
}): Promise<ActionResult<{ generatedKey: string; name: string }>> {
  try {
    // ========== 权限检查：所有用户（包括 admin）都只能为自己创建 Key ==========
    const session = await getSession();
    if (!session) {
      return { ok: false, error: "未登录" };
    }

    // 严格检查：只能为自己创建 Key
    if (session.user.id !== data.userId) {
      return { ok: false, error: "您只能为自己创建 Key，无法为其他用户创建" };
    }

    // ========== 检查 Key 数量限制 ==========
    const { findUserById } = await import("@/repository/user");
    const user = await findUserById(session.user.id);
    if (!user) {
      return { ok: false, error: "用户不存在" };
    }

    const currentKeyCount = await countActiveKeysByUser(session.user.id);
    const maxKeysCount = user.maxKeysCount ?? 3; // 默认最多 3 个 Key

    if (currentKeyCount >= maxKeysCount) {
      return {
        ok: false,
        error: `您已达到 Key 数量上限（${currentKeyCount}/${maxKeysCount}），请删除现有 Key 后再创建新 Key`,
      };
    }

    const validatedData = KeyFormSchema.parse({
      name: data.name,
      expiresAt: data.expiresAt,
      canLoginWebUi: data.canLoginWebUi,
      // 独立限额
      limit5hUsd: data.limit5hUsd,
      limitWeeklyUsd: data.limitWeeklyUsd,
      limitMonthlyUsd: data.limitMonthlyUsd,
      totalLimitUsd: data.totalLimitUsd,
      limitConcurrentSessions: data.limitConcurrentSessions,
      rpmLimit: data.rpmLimit,
      dailyQuota: data.dailyQuota,
      // 账期周期配置
      billingCycleStart: data.billingCycleStart,
    });

    // 检查是否存在同名的生效key
    const existingKey = await findActiveKeyByUserIdAndName(data.userId, validatedData.name);
    if (existingKey) {
      return {
        ok: false,
        error: `名为"${validatedData.name}"的密钥已存在且正在生效中，请使用不同的名称`,
      };
    }

    const generatedKey = "sk-" + randomBytes(16).toString("hex");

    // ⭐ 加密密钥后再存储到数据库
    const encryptedKey = encryptKey(generatedKey);
    logger.debug(`[Key] Key encrypted for storage - userId=${session.user.id}`);

    await createKey({
      user_id: data.userId,
      name: validatedData.name,
      key: encryptedKey, // 存储加密后的密钥
      is_enabled: true,
      expires_at: validatedData.expiresAt ? new Date(validatedData.expiresAt) : undefined,
      can_login_web_ui: validatedData.canLoginWebUi,
      // 独立限额
      limit_5h_usd: validatedData.limit5hUsd,
      limit_weekly_usd: validatedData.limitWeeklyUsd,
      limit_monthly_usd: validatedData.limitMonthlyUsd,
      total_limit_usd: validatedData.totalLimitUsd,
      limit_concurrent_sessions: validatedData.limitConcurrentSessions,
      rpm_limit: validatedData.rpmLimit,
      daily_limit_usd: validatedData.dailyQuota,
      // 账期周期配置
      billing_cycle_start: validatedData.billingCycleStart
        ? new Date(validatedData.billingCycleStart)
        : undefined,
    });

    logger.info(
      `[Key] Key created: userId=${session.user.id}, name=${validatedData.name}, ` +
        `currentCount=${currentKeyCount + 1}/${maxKeysCount}`
    );

    revalidatePath("/dashboard");

    // ⭐ 返回明文密钥供前端显示（仅此一次）
    return { ok: true, data: { generatedKey, name: validatedData.name } };
  } catch (error) {
    logger.error("添加密钥失败:", error);
    const message = error instanceof Error ? error.message : "添加密钥失败，请稍后重试";
    return { ok: false, error: message };
  }
}

// 更新密钥
export async function editKey(
  keyId: number,
  data: {
    name: string;
    expiresAt?: string;
    canLoginWebUi?: boolean;
    // 独立限额
    limit5hUsd?: number | null;
    limitWeeklyUsd?: number | null;
    limitMonthlyUsd?: number | null;
    totalLimitUsd?: number | null;
    limitConcurrentSessions?: number;
    rpmLimit?: number | null;
    dailyQuota?: number | null;
  }
): Promise<ActionResult> {
  try {
    // ========== 权限检查：所有用户（包括 admin）都只能编辑自己的 Key ==========
    const session = await getSession();
    if (!session) {
      return { ok: false, error: "未登录" };
    }

    const key = await findKeyById(keyId);
    if (!key) {
      return { ok: false, error: "密钥不存在" };
    }

    // 严格检查：只能编辑自己的 Key
    if (session.user.id !== key.userId) {
      return { ok: false, error: "您只能编辑自己的 Key，无法编辑其他用户的 Key" };
    }

    const validatedData = KeyFormSchema.parse(data);

    await updateKey(keyId, {
      name: validatedData.name,
      expires_at: validatedData.expiresAt ? new Date(validatedData.expiresAt) : undefined,
      can_login_web_ui: validatedData.canLoginWebUi,
      // 独立限额
      limit_5h_usd: validatedData.limit5hUsd,
      limit_weekly_usd: validatedData.limitWeeklyUsd,
      limit_monthly_usd: validatedData.limitMonthlyUsd,
      total_limit_usd: validatedData.totalLimitUsd,
      limit_concurrent_sessions: validatedData.limitConcurrentSessions,
      rpm_limit: validatedData.rpmLimit,
      daily_limit_usd: validatedData.dailyQuota,
    });

    logger.info(
      `[Key] Key updated: userId=${session.user.id}, keyId=${keyId}, name=${validatedData.name}`
    );

    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    logger.error("更新密钥失败:", error);
    const message = error instanceof Error ? error.message : "更新密钥失败，请稍后重试";
    return { ok: false, error: message };
  }
}

// 删除密钥
export async function removeKey(keyId: number): Promise<ActionResult> {
  try {
    // ========== 权限检查：所有用户（包括 admin）都只能删除自己的 Key ==========
    const session = await getSession();
    if (!session) {
      return { ok: false, error: "未登录" };
    }

    const key = await findKeyById(keyId);
    if (!key) {
      return { ok: false, error: "密钥不存在" };
    }

    // 严格检查：只能删除自己的 Key
    if (session.user.id !== key.userId) {
      return { ok: false, error: "您只能删除自己的 Key，无法删除其他用户的 Key" };
    }

    await deleteKey(keyId);

    logger.info(`[Key] Key deleted: userId=${session.user.id}, keyId=${keyId}`);

    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    logger.error("删除密钥失败:", error);
    const message = error instanceof Error ? error.message : "删除密钥失败，请稍后重试";
    return { ok: false, error: message };
  }
}

// 获取用户的密钥列表
export async function getKeys(userId: number): Promise<ActionResult<Key[]>> {
  try {
    const session = await getSession();
    if (!session) {
      return { ok: false, error: "未登录" };
    }

    // 权限检查：用户只能获取自己的密钥，管理员可以获取任何用户的密钥
    if (session.user.role !== "admin" && session.user.id !== userId) {
      return { ok: false, error: "无权限执行此操作" };
    }

    const keys = await findKeyList(userId);
    return { ok: true, data: keys };
  } catch (error) {
    logger.error("获取密钥列表失败:", error);
    return { ok: false, error: "获取密钥列表失败" };
  }
}

// 获取用户密钥的统计信息
export async function getKeysWithStatistics(
  userId: number
): Promise<ActionResult<KeyStatistics[]>> {
  try {
    const session = await getSession();
    if (!session) {
      return { ok: false, error: "未登录" };
    }

    // 权限检查：用户只能获取自己的统计，管理员可以获取任何用户的统计
    if (session.user.role !== "admin" && session.user.id !== userId) {
      return { ok: false, error: "无权限执行此操作" };
    }

    const stats = await findKeysWithStatistics(userId);
    return { ok: true, data: stats };
  } catch (error) {
    logger.error("获取密钥统计失败:", error);
    return { ok: false, error: "获取密钥统计失败" };
  }
}
