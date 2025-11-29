"use server";

import { db } from "@/drizzle/db";
import { users } from "@/drizzle/schema";
import { eq, isNull, and, sql } from "drizzle-orm";
import type { User, CreateUserData, UpdateUserData } from "@/types/user";
import { toUser } from "./_shared/transformers";

export async function createUser(userData: CreateUserData): Promise<User> {
  const dbData = {
    name: userData.name,
    description: userData.description,
    role: userData.role ?? "user",
    providerGroup: userData.providerGroup,
    tags: userData.tags ?? [],
    isEnabled: userData.isEnabled ?? true,
    expiresAt: userData.expiresAt ?? null,
    // ========== 父子关系配置 ==========
    parentUserId: userData.parentUserId ?? null,
    // ========== 密码认证配置 ==========
    passwordHash: userData.passwordHash ?? null,
    passwordUpdatedAt: userData.passwordUpdatedAt ?? null,
    forcePasswordChange: userData.forcePasswordChange ?? false,
    // ========== Key 管理配置 ==========
    maxKeysCount: userData.maxKeysCount ?? 3,
    // 用户级别限额字段
    limit5hUsd: userData.limit5hUsd !== undefined ? userData.limit5hUsd?.toString() : null,
    limitWeeklyUsd:
      userData.limitWeeklyUsd !== undefined ? userData.limitWeeklyUsd?.toString() : null,
    limitMonthlyUsd:
      userData.limitMonthlyUsd !== undefined ? userData.limitMonthlyUsd?.toString() : null,
    totalLimitUsd: userData.totalLimitUsd !== undefined ? userData.totalLimitUsd?.toString() : null,
    // ========== 额度共享配置 ==========
    inheritParentLimits: userData.inheritParentLimits ?? true,
    // 账期周期配置
    billingCycleStart: userData.billingCycleStart ?? null,
    // ========== 余额使用策略 ==========
    balanceUsagePolicy: userData.balanceUsagePolicy ?? "after_quota",
  };

  const [user] = await db.insert(users).values(dbData).returning({
    id: users.id,
    name: users.name,
    description: users.description,
    role: users.role,
    providerGroup: users.providerGroup,
    tags: users.tags,
    isEnabled: users.isEnabled,
    expiresAt: users.expiresAt,
    // 父子关系配置
    parentUserId: users.parentUserId,
    // 密码认证配置
    passwordHash: users.passwordHash,
    passwordUpdatedAt: users.passwordUpdatedAt,
    forcePasswordChange: users.forcePasswordChange,
    // Key 管理配置
    maxKeysCount: users.maxKeysCount,
    // 限额字段
    limit5hUsd: users.limit5hUsd,
    limitWeeklyUsd: users.limitWeeklyUsd,
    limitMonthlyUsd: users.limitMonthlyUsd,
    totalLimitUsd: users.totalLimitUsd,
    // 额度共享配置
    inheritParentLimits: users.inheritParentLimits,
    // 账期周期配置
    billingCycleStart: users.billingCycleStart,
    // 余额使用策略
    balanceUsagePolicy: users.balanceUsagePolicy,
    balanceUsd: users.balanceUsd,
    balanceUpdatedAt: users.balanceUpdatedAt,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
    deletedAt: users.deletedAt,
  });

  return toUser(user);
}

export async function findUserList(limit: number = 50, offset: number = 0): Promise<User[]> {
  const result = await db
    .select({
      id: users.id,
      name: users.name,
      description: users.description,
      role: users.role,
      providerGroup: users.providerGroup,
      tags: users.tags,
      isEnabled: users.isEnabled,
      expiresAt: users.expiresAt,
      // 父子关系配置
      parentUserId: users.parentUserId,
      // 密码认证配置
      passwordHash: users.passwordHash,
      passwordUpdatedAt: users.passwordUpdatedAt,
      forcePasswordChange: users.forcePasswordChange,
      // Key 管理配置
      maxKeysCount: users.maxKeysCount,
      // 用户级别限额字段
      limit5hUsd: users.limit5hUsd,
      limitWeeklyUsd: users.limitWeeklyUsd,
      limitMonthlyUsd: users.limitMonthlyUsd,
      totalLimitUsd: users.totalLimitUsd,
      // 额度共享配置
      inheritParentLimits: users.inheritParentLimits,
      // 账期周期配置
      billingCycleStart: users.billingCycleStart,
      // 余额使用策略
      balanceUsagePolicy: users.balanceUsagePolicy,
      // 余额字段
      balanceUsd: users.balanceUsd,
      balanceUpdatedAt: users.balanceUpdatedAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(sql`CASE WHEN ${users.role} = 'admin' THEN 0 ELSE 1 END`, users.id)
    .limit(limit)
    .offset(offset);

  return result.map(toUser);
}

export async function updateUser(id: number, userData: UpdateUserData): Promise<User | null> {
  if (Object.keys(userData).length === 0) {
    return findUserById(id);
  }

  interface UpdateDbData {
    name?: string;
    description?: string;
    role?: "admin" | "reseller" | "user";
    providerGroup?: string | null;
    tags?: string[];
    isEnabled?: boolean;
    expiresAt?: Date | null;
    // 父子关系配置
    parentUserId?: number | null;
    // 密码认证配置
    passwordHash?: string | null;
    passwordUpdatedAt?: Date | null;
    forcePasswordChange?: boolean;
    // Key 管理配置
    maxKeysCount?: number;
    // 用户级别限额字段
    limit5hUsd?: string | null;
    limitWeeklyUsd?: string | null;
    limitMonthlyUsd?: string | null;
    totalLimitUsd?: string | null;
    // 额度共享配置
    inheritParentLimits?: boolean;
    // 账期周期配置
    billingCycleStart?: Date | null;
    updatedAt?: Date;
  }

  const dbData: UpdateDbData = {
    updatedAt: new Date(),
  };
  if (userData.name !== undefined) dbData.name = userData.name;
  if (userData.description !== undefined) dbData.description = userData.description;
  if (userData.role !== undefined) dbData.role = userData.role;
  if (userData.providerGroup !== undefined) dbData.providerGroup = userData.providerGroup;
  if (userData.tags !== undefined) dbData.tags = userData.tags;
  if (userData.isEnabled !== undefined) dbData.isEnabled = userData.isEnabled;
  if (userData.expiresAt !== undefined) dbData.expiresAt = userData.expiresAt;

  // 父子关系配置
  if (userData.parentUserId !== undefined) dbData.parentUserId = userData.parentUserId;

  // 密码认证配置
  if (userData.passwordHash !== undefined) dbData.passwordHash = userData.passwordHash;
  if (userData.passwordUpdatedAt !== undefined)
    dbData.passwordUpdatedAt = userData.passwordUpdatedAt;
  if (userData.forcePasswordChange !== undefined)
    dbData.forcePasswordChange = userData.forcePasswordChange;

  // Key 管理配置
  if (userData.maxKeysCount !== undefined) dbData.maxKeysCount = userData.maxKeysCount;

  // 用户级别限额字段
  if (userData.limit5hUsd !== undefined)
    dbData.limit5hUsd = userData.limit5hUsd !== null ? userData.limit5hUsd.toString() : null;
  if (userData.limitWeeklyUsd !== undefined)
    dbData.limitWeeklyUsd =
      userData.limitWeeklyUsd !== null ? userData.limitWeeklyUsd.toString() : null;
  if (userData.limitMonthlyUsd !== undefined)
    dbData.limitMonthlyUsd =
      userData.limitMonthlyUsd !== null ? userData.limitMonthlyUsd.toString() : null;
  if (userData.totalLimitUsd !== undefined)
    dbData.totalLimitUsd =
      userData.totalLimitUsd !== null ? userData.totalLimitUsd.toString() : null;

  // 额度共享配置
  if (userData.inheritParentLimits !== undefined)
    dbData.inheritParentLimits = userData.inheritParentLimits;

  // 账期周期配置
  if (userData.billingCycleStart !== undefined)
    dbData.billingCycleStart = userData.billingCycleStart;

  const [user] = await db
    .update(users)
    .set(dbData)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .returning({
      id: users.id,
      name: users.name,
      description: users.description,
      role: users.role,
      providerGroup: users.providerGroup,
      tags: users.tags,
      isEnabled: users.isEnabled,
      expiresAt: users.expiresAt,
      // 父子关系配置
      parentUserId: users.parentUserId,
      // 密码认证配置
      passwordHash: users.passwordHash,
      passwordUpdatedAt: users.passwordUpdatedAt,
      forcePasswordChange: users.forcePasswordChange,
      // Key 管理配置
      maxKeysCount: users.maxKeysCount,
      // 限额字段
      limit5hUsd: users.limit5hUsd,
      limitWeeklyUsd: users.limitWeeklyUsd,
      limitMonthlyUsd: users.limitMonthlyUsd,
      totalLimitUsd: users.totalLimitUsd,
      // 额度共享配置
      inheritParentLimits: users.inheritParentLimits,
      // 账期周期配置
      billingCycleStart: users.billingCycleStart,
      balanceUsd: users.balanceUsd,
      balanceUpdatedAt: users.balanceUpdatedAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      deletedAt: users.deletedAt,
    });

  if (!user) return null;

  return toUser(user);
}

export async function deleteUser(id: number): Promise<boolean> {
  const result = await db
    .update(users)
    .set({ deletedAt: new Date() })
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .returning({ id: users.id });

  return result.length > 0;
}

/**
 * 根据 ID 查询用户（包含限额配置）
 */
export async function findUserById(id: number): Promise<User | null> {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      description: users.description,
      role: users.role,
      providerGroup: users.providerGroup,
      tags: users.tags,
      isEnabled: users.isEnabled,
      expiresAt: users.expiresAt,
      // 父子关系配置
      parentUserId: users.parentUserId,
      // 密码认证配置
      passwordHash: users.passwordHash,
      passwordUpdatedAt: users.passwordUpdatedAt,
      forcePasswordChange: users.forcePasswordChange,
      // Key 管理配置
      maxKeysCount: users.maxKeysCount,
      // 用户级别限额字段
      limit5hUsd: users.limit5hUsd,
      limitWeeklyUsd: users.limitWeeklyUsd,
      limitMonthlyUsd: users.limitMonthlyUsd,
      totalLimitUsd: users.totalLimitUsd,
      // 额度共享配置
      inheritParentLimits: users.inheritParentLimits,
      // 账期周期配置
      billingCycleStart: users.billingCycleStart,
      // 余额使用策略
      balanceUsagePolicy: users.balanceUsagePolicy,
      // 余额字段
      balanceUsd: users.balanceUsd,
      balanceUpdatedAt: users.balanceUpdatedAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);

  if (!user) return null;

  return toUser(user);
}

/**
 * 根据用户名查询用户（用于密码登录认证）
 */
export async function findUserByName(name: string): Promise<User | null> {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      description: users.description,
      role: users.role,
      providerGroup: users.providerGroup,
      tags: users.tags,
      isEnabled: users.isEnabled,
      expiresAt: users.expiresAt,
      // 父子关系配置
      parentUserId: users.parentUserId,
      // 密码认证配置
      passwordHash: users.passwordHash,
      passwordUpdatedAt: users.passwordUpdatedAt,
      forcePasswordChange: users.forcePasswordChange,
      // Key 管理配置
      maxKeysCount: users.maxKeysCount,
      // 用户级别限额字段
      limit5hUsd: users.limit5hUsd,
      limitWeeklyUsd: users.limitWeeklyUsd,
      limitMonthlyUsd: users.limitMonthlyUsd,
      totalLimitUsd: users.totalLimitUsd,
      // 额度共享配置
      inheritParentLimits: users.inheritParentLimits,
      // 账期周期配置
      billingCycleStart: users.billingCycleStart,
      // 余额使用策略
      balanceUsagePolicy: users.balanceUsagePolicy,
      // 余额字段
      balanceUsd: users.balanceUsd,
      balanceUpdatedAt: users.balanceUpdatedAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(and(eq(users.name, name), isNull(users.deletedAt)))
    .limit(1);

  if (!user) return null;

  return toUser(user);
}

/**
 * 查询指定用户的所有直接子用户
 * @param parentId 父用户ID
 * @returns 子用户列表
 */
export async function findChildrenByParentId(parentId: number): Promise<User[]> {
  const result = await db
    .select({
      id: users.id,
      name: users.name,
      description: users.description,
      role: users.role,
      providerGroup: users.providerGroup,
      tags: users.tags,
      isEnabled: users.isEnabled,
      expiresAt: users.expiresAt,
      // 父子关系配置
      parentUserId: users.parentUserId,
      // 密码认证配置
      passwordHash: users.passwordHash,
      passwordUpdatedAt: users.passwordUpdatedAt,
      forcePasswordChange: users.forcePasswordChange,
      // Key 管理配置
      maxKeysCount: users.maxKeysCount,
      // 用户级别限额字段
      limit5hUsd: users.limit5hUsd,
      limitWeeklyUsd: users.limitWeeklyUsd,
      limitMonthlyUsd: users.limitMonthlyUsd,
      totalLimitUsd: users.totalLimitUsd,
      // 额度共享配置
      inheritParentLimits: users.inheritParentLimits,
      // 账期周期配置
      billingCycleStart: users.billingCycleStart,
      // 余额使用策略
      balanceUsagePolicy: users.balanceUsagePolicy,
      // 余额字段
      balanceUsd: users.balanceUsd,
      balanceUpdatedAt: users.balanceUpdatedAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(and(eq(users.parentUserId, parentId), isNull(users.deletedAt)));

  return result.map(toUser);
}
