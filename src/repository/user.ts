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
    providerGroup: userData.providerGroup,
    tags: userData.tags ?? [],
    isEnabled: userData.isEnabled ?? true,
    expiresAt: userData.expiresAt ?? null,
    // 用户级别限额字段
    limit5hUsd: userData.limit5hUsd !== undefined ? userData.limit5hUsd?.toString() : null,
    limitWeeklyUsd:
      userData.limitWeeklyUsd !== undefined ? userData.limitWeeklyUsd?.toString() : null,
    limitMonthlyUsd:
      userData.limitMonthlyUsd !== undefined ? userData.limitMonthlyUsd?.toString() : null,
    totalLimitUsd: userData.totalLimitUsd !== undefined ? userData.totalLimitUsd?.toString() : null,
    // 账期周期配置
    billingCycleStart: userData.billingCycleStart ?? null,
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
    limit5hUsd: users.limit5hUsd,
    limitWeeklyUsd: users.limitWeeklyUsd,
    limitMonthlyUsd: users.limitMonthlyUsd,
    totalLimitUsd: users.totalLimitUsd,
    billingCycleStart: users.billingCycleStart,
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
      // 用户级别限额字段
      limit5hUsd: users.limit5hUsd,
      limitWeeklyUsd: users.limitWeeklyUsd,
      limitMonthlyUsd: users.limitMonthlyUsd,
      totalLimitUsd: users.totalLimitUsd,
      // 账期周期配置
      billingCycleStart: users.billingCycleStart,
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
    providerGroup?: string | null;
    tags?: string[];
    isEnabled?: boolean;
    expiresAt?: Date | null;
    // 用户级别限额字段
    limit5hUsd?: string | null;
    limitWeeklyUsd?: string | null;
    limitMonthlyUsd?: string | null;
    totalLimitUsd?: string | null;
    // 账期周期配置
    billingCycleStart?: Date | null;
    updatedAt?: Date;
  }

  const dbData: UpdateDbData = {
    updatedAt: new Date(),
  };
  if (userData.name !== undefined) dbData.name = userData.name;
  if (userData.description !== undefined) dbData.description = userData.description;
  if (userData.providerGroup !== undefined) dbData.providerGroup = userData.providerGroup;
  if (userData.tags !== undefined) dbData.tags = userData.tags;
  if (userData.isEnabled !== undefined) dbData.isEnabled = userData.isEnabled;
  if (userData.expiresAt !== undefined) dbData.expiresAt = userData.expiresAt;

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
      limit5hUsd: users.limit5hUsd,
      limitWeeklyUsd: users.limitWeeklyUsd,
      limitMonthlyUsd: users.limitMonthlyUsd,
      totalLimitUsd: users.totalLimitUsd,
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
      // 用户级别限额字段
      limit5hUsd: users.limit5hUsd,
      limitWeeklyUsd: users.limitWeeklyUsd,
      limitMonthlyUsd: users.limitMonthlyUsd,
      totalLimitUsd: users.totalLimitUsd,
      // 账期周期配置
      billingCycleStart: users.billingCycleStart,
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
