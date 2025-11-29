"use server";

import { db } from "@/drizzle/db";
import { keys, users, messageRequest, providers } from "@/drizzle/schema";
import { eq, isNull, and, or, gt, gte, lt, count, sum, desc, sql, like } from "drizzle-orm";
import type { Key, CreateKeyData, UpdateKeyData } from "@/types/key";
import type { User } from "@/types/user";
import { toKey, toUser } from "./_shared/transformers";
import { Decimal, toCostDecimal } from "@/lib/utils/currency";
import { hashKey, verifyKey, decryptKey } from "@/lib/crypto";

export async function findKeyList(userId: number): Promise<Key[]> {
  const result = await db
    .select({
      id: keys.id,
      userId: keys.userId,
      key: keys.key,
      name: keys.name,
      isEnabled: keys.isEnabled,
      expiresAt: keys.expiresAt,
      canLoginWebUi: keys.canLoginWebUi,
      limit5hUsd: keys.limit5hUsd,
      limitWeeklyUsd: keys.limitWeeklyUsd,
      limitMonthlyUsd: keys.limitMonthlyUsd,
      totalLimitUsd: keys.totalLimitUsd,
      limitConcurrentSessions: keys.limitConcurrentSessions,
      rpmLimit: keys.rpmLimit,
      dailyLimitUsd: keys.dailyLimitUsd,
      billingCycleStart: keys.billingCycleStart,
      createdAt: keys.createdAt,
      updatedAt: keys.updatedAt,
      deletedAt: keys.deletedAt,
    })
    .from(keys)
    .where(and(eq(keys.userId, userId), isNull(keys.deletedAt)))
    .orderBy(keys.createdAt);

  return result.map(toKey);
}

/**
 * 查询多个用户的所有密钥（用于 Reseller 查询自己 + 所有子用户的密钥）
 * @param userIds 用户 ID 列表
 * @returns Key 数组
 */
export async function findKeyListForMultipleUsers(userIds: number[]): Promise<Key[]> {
  if (userIds.length === 0) {
    return [];
  }

  const result = await db
    .select({
      id: keys.id,
      userId: keys.userId,
      key: keys.key,
      name: keys.name,
      isEnabled: keys.isEnabled,
      expiresAt: keys.expiresAt,
      canLoginWebUi: keys.canLoginWebUi,
      limit5hUsd: keys.limit5hUsd,
      limitWeeklyUsd: keys.limitWeeklyUsd,
      limitMonthlyUsd: keys.limitMonthlyUsd,
      totalLimitUsd: keys.totalLimitUsd,
      limitConcurrentSessions: keys.limitConcurrentSessions,
      rpmLimit: keys.rpmLimit,
      dailyLimitUsd: keys.dailyLimitUsd,
      billingCycleStart: keys.billingCycleStart,
      createdAt: keys.createdAt,
      updatedAt: keys.updatedAt,
      deletedAt: keys.deletedAt,
    })
    .from(keys)
    .where(
      and(
        sql`${keys.userId} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`,
        isNull(keys.deletedAt)
      )
    )
    .orderBy(keys.createdAt);

  return result.map(toKey);
}

export async function createKey(keyData: CreateKeyData): Promise<Key> {
  const dbData = {
    userId: keyData.user_id,
    key: keyData.key,
    name: keyData.name,
    isEnabled: keyData.is_enabled,
    expiresAt: keyData.expires_at,
    canLoginWebUi: keyData.can_login_web_ui ?? true,
    // 独立限额
    limit5hUsd: keyData.limit_5h_usd != null ? keyData.limit_5h_usd.toString() : null,
    limitWeeklyUsd: keyData.limit_weekly_usd != null ? keyData.limit_weekly_usd.toString() : null,
    limitMonthlyUsd:
      keyData.limit_monthly_usd != null ? keyData.limit_monthly_usd.toString() : null,
    totalLimitUsd: keyData.total_limit_usd != null ? keyData.total_limit_usd.toString() : null,
    limitConcurrentSessions: keyData.limit_concurrent_sessions,
    rpmLimit: keyData.rpm_limit === undefined ? undefined : keyData.rpm_limit,
    dailyLimitUsd:
      keyData.daily_limit_usd === undefined
        ? undefined
        : keyData.daily_limit_usd != null
          ? keyData.daily_limit_usd.toString()
          : null,
    // 账期周期配置
    billingCycleStart: keyData.billing_cycle_start ?? null,
  };

  const [key] = await db.insert(keys).values(dbData).returning({
    id: keys.id,
    userId: keys.userId,
    key: keys.key,
    name: keys.name,
    isEnabled: keys.isEnabled,
    expiresAt: keys.expiresAt,
    canLoginWebUi: keys.canLoginWebUi,
    limit5hUsd: keys.limit5hUsd,
    limitWeeklyUsd: keys.limitWeeklyUsd,
    limitMonthlyUsd: keys.limitMonthlyUsd,
    totalLimitUsd: keys.totalLimitUsd,
    limitConcurrentSessions: keys.limitConcurrentSessions,
    rpmLimit: keys.rpmLimit,
    dailyLimitUsd: keys.dailyLimitUsd,
    billingCycleStart: keys.billingCycleStart,
    createdAt: keys.createdAt,
    updatedAt: keys.updatedAt,
    deletedAt: keys.deletedAt,
  });

  return toKey(key);
}

export async function updateKey(id: number, keyData: UpdateKeyData): Promise<Key | null> {
  if (Object.keys(keyData).length === 0) {
    return findKeyById(id);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbData: any = {
    updatedAt: new Date(),
  };
  if (keyData.name !== undefined) dbData.name = keyData.name;
  if (keyData.is_enabled !== undefined) dbData.isEnabled = keyData.is_enabled;
  if (keyData.expires_at !== undefined) dbData.expiresAt = keyData.expires_at;
  if (keyData.can_login_web_ui !== undefined) dbData.canLoginWebUi = keyData.can_login_web_ui;
  // 独立限额
  if (keyData.limit_5h_usd !== undefined)
    dbData.limit5hUsd = keyData.limit_5h_usd != null ? keyData.limit_5h_usd.toString() : null;
  if (keyData.limit_weekly_usd !== undefined)
    dbData.limitWeeklyUsd =
      keyData.limit_weekly_usd != null ? keyData.limit_weekly_usd.toString() : null;
  if (keyData.limit_monthly_usd !== undefined)
    dbData.limitMonthlyUsd =
      keyData.limit_monthly_usd != null ? keyData.limit_monthly_usd.toString() : null;
  if (keyData.total_limit_usd !== undefined)
    dbData.totalLimitUsd =
      keyData.total_limit_usd != null ? keyData.total_limit_usd.toString() : null;
  if (keyData.limit_concurrent_sessions !== undefined)
    dbData.limitConcurrentSessions = keyData.limit_concurrent_sessions;
  if (keyData.rpm_limit !== undefined) dbData.rpmLimit = keyData.rpm_limit;
  if (keyData.daily_limit_usd !== undefined)
    dbData.dailyLimitUsd =
      keyData.daily_limit_usd != null ? keyData.daily_limit_usd.toString() : null;

  const [key] = await db
    .update(keys)
    .set(dbData)
    .where(and(eq(keys.id, id), isNull(keys.deletedAt)))
    .returning({
      id: keys.id,
      userId: keys.userId,
      key: keys.key,
      name: keys.name,
      isEnabled: keys.isEnabled,
      expiresAt: keys.expiresAt,
      canLoginWebUi: keys.canLoginWebUi,
      limit5hUsd: keys.limit5hUsd,
      limitWeeklyUsd: keys.limitWeeklyUsd,
      limitMonthlyUsd: keys.limitMonthlyUsd,
      totalLimitUsd: keys.totalLimitUsd,
      limitConcurrentSessions: keys.limitConcurrentSessions,
      rpmLimit: keys.rpmLimit,
      dailyLimitUsd: keys.dailyLimitUsd,
      createdAt: keys.createdAt,
      updatedAt: keys.updatedAt,
      deletedAt: keys.deletedAt,
    });

  if (!key) return null;
  return toKey(key);
}

export async function findActiveKeyByUserIdAndName(
  userId: number,
  name: string
): Promise<Key | null> {
  const [key] = await db
    .select({
      id: keys.id,
      userId: keys.userId,
      key: keys.key,
      name: keys.name,
      isEnabled: keys.isEnabled,
      expiresAt: keys.expiresAt,
      canLoginWebUi: keys.canLoginWebUi,
      limit5hUsd: keys.limit5hUsd,
      limitWeeklyUsd: keys.limitWeeklyUsd,
      limitMonthlyUsd: keys.limitMonthlyUsd,
      limitConcurrentSessions: keys.limitConcurrentSessions,
      rpmLimit: keys.rpmLimit,
      dailyLimitUsd: keys.dailyLimitUsd,
      createdAt: keys.createdAt,
      updatedAt: keys.updatedAt,
      deletedAt: keys.deletedAt,
    })
    .from(keys)
    .innerJoin(users, and(eq(users.id, keys.userId), isNull(users.deletedAt)))
    .where(
      and(
        eq(keys.userId, userId),
        eq(keys.name, name),
        isNull(keys.deletedAt),
        eq(keys.isEnabled, true),
        or(isNull(keys.expiresAt), gt(keys.expiresAt, new Date())),
        eq(users.isEnabled, true),
        or(isNull(users.expiresAt), gt(users.expiresAt, new Date()))
      )
    );

  if (!key) return null;
  return toKey(key);
}

export interface DateRangeFilter {
  start?: Date;
  end?: Date;
}

export async function findKeyUsageInRange(
  userId: number,
  range?: DateRangeFilter
): Promise<Array<{ keyId: number; totalCost: number }>> {
  const dateFilter =
    range ??
    (() => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { start: today, end: tomorrow };
    })();

  const joinConditions = [eq(messageRequest.key, keys.key), isNull(messageRequest.deletedAt)];
  if (dateFilter.start) {
    joinConditions.push(gte(messageRequest.createdAt, dateFilter.start));
  }
  if (dateFilter.end) {
    joinConditions.push(lt(messageRequest.createdAt, dateFilter.end));
  }

  const rows = await db
    .select({
      keyId: keys.id,
      // ⭐ 修复：使用双轨计费字段统计消费，确保与限流检查一致
      // 优先使用 package_cost_usd + balance_cost_usd，如果都为NULL则fallback到cost_usd
      totalCost: sql<string>`COALESCE(
        SUM(
          COALESCE(${messageRequest.packageCostUsd}, 0) +
          COALESCE(${messageRequest.balanceCostUsd}, 0)
        ),
        SUM(COALESCE(${messageRequest.costUsd}, 0)),
        0
      )`,
    })
    .from(keys)
    .leftJoin(messageRequest, and(...joinConditions))
    .where(and(eq(keys.userId, userId), isNull(keys.deletedAt)))
    .groupBy(keys.id);

  return rows.map((row) => ({
    keyId: row.keyId,
    totalCost: (() => {
      const costDecimal = toCostDecimal(row.totalCost) ?? new Decimal(0);
      return costDecimal.toDecimalPlaces(6).toNumber();
    })(),
  }));
}

/**
 * 查询多个用户的所有密钥使用数据（用于 Reseller 查询自己 + 所有子用户的消费）
 * @param userIds 用户 ID 列表
 * @param range 时间范围过滤
 * @returns { keyId, totalCost } 数组
 */
export async function findKeyUsageForMultipleUsers(
  userIds: number[],
  range?: DateRangeFilter
): Promise<Array<{ keyId: number; totalCost: number }>> {
  if (userIds.length === 0) {
    return [];
  }

  const dateFilter =
    range ??
    (() => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { start: today, end: tomorrow };
    })();

  const joinConditions = [eq(messageRequest.key, keys.key), isNull(messageRequest.deletedAt)];
  if (dateFilter.start) {
    joinConditions.push(gte(messageRequest.createdAt, dateFilter.start));
  }
  if (dateFilter.end) {
    joinConditions.push(lt(messageRequest.createdAt, dateFilter.end));
  }

  const rows = await db
    .select({
      keyId: keys.id,
      // ⭐ 修复：使用双轨计费字段统计消费，确保与限流检查一致
      totalCost: sql<string>`COALESCE(
        SUM(
          COALESCE(${messageRequest.packageCostUsd}, 0) +
          COALESCE(${messageRequest.balanceCostUsd}, 0)
        ),
        SUM(COALESCE(${messageRequest.costUsd}, 0)),
        0
      )`,
    })
    .from(keys)
    .leftJoin(messageRequest, and(...joinConditions))
    .where(
      and(
        sql`${keys.userId} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`,
        isNull(keys.deletedAt)
      )
    )
    .groupBy(keys.id);

  return rows.map((row) => ({
    keyId: row.keyId,
    totalCost: (() => {
      const costDecimal = toCostDecimal(row.totalCost) ?? new Decimal(0);
      return costDecimal.toDecimalPlaces(6).toNumber();
    })(),
  }));
}

export async function countActiveKeysByUser(userId: number): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(keys)
    .where(and(eq(keys.userId, userId), isNull(keys.deletedAt)));

  return Number(row?.count || 0);
}

export async function deleteKey(id: number): Promise<boolean> {
  const result = await db
    .update(keys)
    .set({ deletedAt: new Date() })
    .where(and(eq(keys.id, id), isNull(keys.deletedAt)))
    .returning({ id: keys.id });

  return result.length > 0;
}

export async function findActiveKeyByKeyString(keyString: string): Promise<Key | null> {
  // ⭐ 使用哈希 + 加密混合方案查询
  // 1. 计算输入密钥的哈希
  const inputHash = hashKey(keyString);

  // 2. 查询所有哈希前缀匹配的活动密钥
  const results = await db
    .select({
      id: keys.id,
      userId: keys.userId,
      key: keys.key,
      name: keys.name,
      isEnabled: keys.isEnabled,
      expiresAt: keys.expiresAt,
      canLoginWebUi: keys.canLoginWebUi,
      limit5hUsd: keys.limit5hUsd,
      limitWeeklyUsd: keys.limitWeeklyUsd,
      limitMonthlyUsd: keys.limitMonthlyUsd,
      totalLimitUsd: keys.totalLimitUsd, // ⭐ 添加缺失的 totalLimitUsd 字段
      limitConcurrentSessions: keys.limitConcurrentSessions,
      rpmLimit: keys.rpmLimit,
      dailyLimitUsd: keys.dailyLimitUsd,
      createdAt: keys.createdAt,
      updatedAt: keys.updatedAt,
      deletedAt: keys.deletedAt,
    })
    .from(keys)
    .innerJoin(users, and(eq(users.id, keys.userId), isNull(users.deletedAt)))
    .where(
      and(
        like(keys.key, `${inputHash}:%`), // 使用哈希前缀匹配
        isNull(keys.deletedAt),
        eq(keys.isEnabled, true),
        or(isNull(keys.expiresAt), gt(keys.expiresAt, new Date())),
        eq(users.isEnabled, true),
        or(isNull(users.expiresAt), gt(users.expiresAt, new Date()))
      )
    );

  // 3. 在内存中验证完整密钥（防止哈希碰撞）
  for (const result of results) {
    if (verifyKey(keyString, result.key)) {
      return toKey(result);
    }
  }

  return null;
}

// 验证 API Key 并返回用户信息
export async function validateApiKeyAndGetUser(
  keyString: string
): Promise<{ user: User; key: Key } | null> {
  // ⭐ 使用哈希 + 加密混合方案查询
  const inputHash = hashKey(keyString);

  const results = await db
    .select({
      // Key fields
      keyId: keys.id,
      keyUserId: keys.userId,
      keyString: keys.key,
      keyName: keys.name,
      keyIsEnabled: keys.isEnabled,
      keyExpiresAt: keys.expiresAt,
      keyCanLoginWebUi: keys.canLoginWebUi,
      keyLimit5hUsd: keys.limit5hUsd,
      keyLimitWeeklyUsd: keys.limitWeeklyUsd,
      keyLimitMonthlyUsd: keys.limitMonthlyUsd,
      keyTotalLimitUsd: keys.totalLimitUsd,
      keyLimitConcurrentSessions: keys.limitConcurrentSessions,
      keyRpmLimit: keys.rpmLimit,
      keyDailyLimitUsd: keys.dailyLimitUsd,
      keyCreatedAt: keys.createdAt,
      keyUpdatedAt: keys.updatedAt,
      keyDeletedAt: keys.deletedAt,
      // User fields
      userId: users.id,
      userName: users.name,
      userDescription: users.description,
      userRole: users.role,
      userProviderGroup: users.providerGroup,
      userTags: users.tags,
      userIsEnabled: users.isEnabled,
      userExpiresAt: users.expiresAt,
      userCreatedAt: users.createdAt,
      userUpdatedAt: users.updatedAt,
      userDeletedAt: users.deletedAt,
    })
    .from(keys)
    .innerJoin(users, eq(keys.userId, users.id))
    .where(
      and(
        like(keys.key, `${inputHash}:%`), // 使用哈希前缀匹配
        isNull(keys.deletedAt),
        eq(keys.isEnabled, true),
        or(isNull(keys.expiresAt), gt(keys.expiresAt, new Date())),
        isNull(users.deletedAt),
        eq(users.isEnabled, true),
        or(isNull(users.expiresAt), gt(users.expiresAt, new Date()))
      )
    );

  // 在内存中验证完整密钥
  for (const row of results) {
    if (verifyKey(keyString, row.keyString)) {
      const user: User = toUser({
        id: row.userId,
        name: row.userName,
        description: row.userDescription,
        role: row.userRole,
        providerGroup: row.userProviderGroup,
        tags: row.userTags,
        isEnabled: row.userIsEnabled,
        expiresAt: row.userExpiresAt,
        createdAt: row.userCreatedAt,
        updatedAt: row.userUpdatedAt,
        deletedAt: row.userDeletedAt,
      });

      const key: Key = toKey({
        id: row.keyId,
        userId: row.keyUserId,
        key: row.keyString,
        name: row.keyName,
        isEnabled: row.keyIsEnabled,
        expiresAt: row.keyExpiresAt,
        canLoginWebUi: row.keyCanLoginWebUi,
        limit5hUsd: row.keyLimit5hUsd,
        limitWeeklyUsd: row.keyLimitWeeklyUsd,
        limitMonthlyUsd: row.keyLimitMonthlyUsd,
        limitConcurrentSessions: row.keyLimitConcurrentSessions,
        rpmLimit: row.keyRpmLimit,
        dailyLimitUsd: row.keyDailyLimitUsd,
        totalLimitUsd: row.keyTotalLimitUsd,
        createdAt: row.keyCreatedAt,
        updatedAt: row.keyUpdatedAt,
        deletedAt: row.keyDeletedAt,
      });

      return { user, key };
    }
  }

  return null;
}

/**
 * 获取密钥的统计信息（用于首页展示）
 */
export interface KeyStatistics {
  keyId: number;
  todayCallCount: number;
  lastUsedAt: Date | null;
  lastProviderName: string | null;
  modelStats: Array<{
    model: string;
    callCount: number;
    totalCost: number;
  }>;
}

export async function findKeysWithStatistics(
  userId: number,
  range?: DateRangeFilter
): Promise<KeyStatistics[]> {
  const userKeys = await findKeyList(userId);

  const dateFilter =
    range ??
    (() => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { start: today, end: tomorrow };
    })();

  const stats: KeyStatistics[] = [];

  for (const key of userKeys) {
    // 查询今日调用次数
    const dateConditions = [eq(messageRequest.key, key.key), isNull(messageRequest.deletedAt)];
    if (dateFilter.start) {
      dateConditions.push(gte(messageRequest.createdAt, dateFilter.start));
    }
    if (dateFilter.end) {
      dateConditions.push(lt(messageRequest.createdAt, dateFilter.end));
    }

    const [todayCount] = await db
      .select({ count: count() })
      .from(messageRequest)
      .where(and(...dateConditions));

    // 查询最后使用时间和供应商
    const [lastUsage] = await db
      .select({
        createdAt: messageRequest.createdAt,
        providerName: providers.name,
      })
      .from(messageRequest)
      .innerJoin(providers, eq(messageRequest.providerId, providers.id))
      .where(and(eq(messageRequest.key, key.key), isNull(messageRequest.deletedAt)))
      .orderBy(desc(messageRequest.createdAt))
      .limit(1);

    // 查询分模型统计（仅统计当天）
    const modelStatsRows = await db
      .select({
        model: messageRequest.model,
        callCount: sql<number>`count(*)::int`,
        // ⭐ 修复：使用双轨计费字段统计消费，确保与 findKeyUsageForMultipleUsers 一致
        // 优先使用 package_cost_usd + balance_cost_usd，如果都为NULL则fallback到cost_usd
        totalCost: sql<string>`COALESCE(
          SUM(
            COALESCE(${messageRequest.packageCostUsd}, 0) +
            COALESCE(${messageRequest.balanceCostUsd}, 0)
          ),
          SUM(COALESCE(${messageRequest.costUsd}, 0)),
          0
        )`,
      })
      .from(messageRequest)
      .where(and(...dateConditions, sql`${messageRequest.model} IS NOT NULL`))
      .groupBy(messageRequest.model)
      .orderBy(desc(sql`count(*)`));

    const modelStats = modelStatsRows.map((row) => ({
      model: row.model || "unknown",
      callCount: row.callCount,
      totalCost: (() => {
        const costDecimal = toCostDecimal(row.totalCost) ?? new Decimal(0);
        return costDecimal.toDecimalPlaces(6).toNumber();
      })(),
    }));

    stats.push({
      keyId: key.id,
      todayCallCount: Number(todayCount?.count || 0),
      lastUsedAt: lastUsage?.createdAt || null,
      lastProviderName: lastUsage?.providerName || null,
      modelStats,
    });
  }

  return stats;
}

/**
 * 根据 ID 查询 Key（包含聚合限额配置）
 */
export async function findKeyById(keyId: number): Promise<Key | null> {
  const [key] = await db
    .select({
      id: keys.id,
      userId: keys.userId,
      key: keys.key,
      name: keys.name,
      isEnabled: keys.isEnabled,
      expiresAt: keys.expiresAt,
      canLoginWebUi: keys.canLoginWebUi,
      // ========== 独立限额 ==========
      limit5hUsd: keys.limit5hUsd,
      limitWeeklyUsd: keys.limitWeeklyUsd,
      limitMonthlyUsd: keys.limitMonthlyUsd,
      totalLimitUsd: keys.totalLimitUsd,
      limitConcurrentSessions: keys.limitConcurrentSessions,
      rpmLimit: keys.rpmLimit,
      dailyLimitUsd: keys.dailyLimitUsd,
      createdAt: keys.createdAt,
      updatedAt: keys.updatedAt,
      deletedAt: keys.deletedAt,
    })
    .from(keys)
    .where(and(eq(keys.id, keyId), isNull(keys.deletedAt)))
    .limit(1);

  if (!key) return null;
  return toKey(key);
}
