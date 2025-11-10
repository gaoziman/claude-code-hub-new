"use server";

import { db } from "@/drizzle/db";
import { sql, and, eq, gte, lt, isNull } from "drizzle-orm";
import { getEnvConfig } from "@/lib/config";
import { messageRequest } from "@/drizzle/schema";
import { keys, providers } from "@/drizzle/schema";
import type {
  TimeRange,
  DatabaseStatRow,
  DatabaseUser,
  DatabaseKeyStatRow,
  DatabaseKey,
  ProviderTrendRow,
  KeyTrendRow,
} from "@/types/statistics";
import type { ProviderType } from "@/types/provider";

/**
 * 根据时间范围获取用户消费和API调用统计
 * 注意：这个函数使用原生SQL，因为涉及到PostgreSQL特定的generate_series函数
 */
export async function getUserStatisticsFromDB(timeRange: TimeRange): Promise<DatabaseStatRow[]> {
  const timezone = getEnvConfig().TZ;
  let query;

  switch (timeRange) {
    case "today":
      // 今天（小时分辨率）
      query = sql`
        WITH hour_range AS (
          SELECT generate_series(
            DATE_TRUNC('day', TIMEZONE(${timezone}, NOW())),
            DATE_TRUNC('day', TIMEZONE(${timezone}, NOW())) + INTERVAL '23 hours',
            '1 hour'::interval
          ) AS hour
        ),
        hourly_stats AS (
          SELECT
            u.id AS user_id,
            u.name AS user_name,
            hr.hour,
            COUNT(mr.id) AS api_calls,
            COALESCE(SUM(mr.cost_usd), 0) AS total_cost
          FROM users u
          CROSS JOIN hour_range hr
          LEFT JOIN message_request mr ON u.id = mr.user_id
            AND DATE_TRUNC('hour', mr.created_at AT TIME ZONE ${timezone}) = hr.hour
            AND mr.deleted_at IS NULL
          WHERE u.deleted_at IS NULL
          GROUP BY u.id, u.name, hr.hour
        )
        SELECT
          user_id,
          user_name,
          hour AS date,
          api_calls::integer,
          total_cost::numeric
        FROM hourly_stats
        ORDER BY hour ASC, user_name ASC
      `;
      break;

    case "7days":
      // 过去7天（天分辨率）
      query = sql`
        WITH date_range AS (
          SELECT generate_series(
            (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date - INTERVAL '6 days',
            (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date,
            '1 day'::interval
          )::date AS date
        ),
        daily_stats AS (
          SELECT
            u.id AS user_id,
            u.name AS user_name,
            dr.date,
            COUNT(mr.id) AS api_calls,
            COALESCE(SUM(mr.cost_usd), 0) AS total_cost
          FROM users u
          CROSS JOIN date_range dr
          LEFT JOIN message_request mr ON u.id = mr.user_id
            AND (mr.created_at AT TIME ZONE ${timezone})::date = dr.date
            AND mr.deleted_at IS NULL
          WHERE u.deleted_at IS NULL
          GROUP BY u.id, u.name, dr.date
        )
        SELECT
          user_id,
          user_name,
          date,
          api_calls::integer,
          total_cost::numeric
        FROM daily_stats
        ORDER BY date ASC, user_name ASC
      `;
      break;

    case "30days":
      // 过去 30 天（天分辨率）
      query = sql`
        WITH date_range AS (
          SELECT generate_series(
            (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date - INTERVAL '29 days',
            (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date,
            '1 day'::interval
          )::date AS date
        ),
        daily_stats AS (
          SELECT
            u.id AS user_id,
            u.name AS user_name,
            dr.date,
            COUNT(mr.id) AS api_calls,
            COALESCE(SUM(mr.cost_usd), 0) AS total_cost
          FROM users u
          CROSS JOIN date_range dr
          LEFT JOIN message_request mr ON u.id = mr.user_id
            AND (mr.created_at AT TIME ZONE ${timezone})::date = dr.date
            AND mr.deleted_at IS NULL
          WHERE u.deleted_at IS NULL
          GROUP BY u.id, u.name, dr.date
        )
        SELECT
          user_id,
          user_name,
          date,
          api_calls::integer,
          total_cost::numeric
        FROM daily_stats
        ORDER BY date ASC, user_name ASC
      `;
      break;

    default:
      throw new Error(`Unsupported time range: ${timeRange}`);
  }

  const result = await db.execute(query);
  return Array.from(result) as unknown as DatabaseStatRow[];
}

/**
 * 获取所有活跃用户列表
 */
export async function getActiveUsersFromDB(): Promise<DatabaseUser[]> {
  const query = sql`
    SELECT id, name
    FROM users
    WHERE deleted_at IS NULL
    ORDER BY name ASC
  `;

  const result = await db.execute(query);
  return Array.from(result) as unknown as DatabaseUser[];
}

/**
 * 获取指定用户的密钥使用统计
 */
export async function getKeyStatisticsFromDB(
  userId: number,
  timeRange: TimeRange
): Promise<DatabaseKeyStatRow[]> {
  const timezone = getEnvConfig().TZ;
  let query;

  switch (timeRange) {
    case "today":
      query = sql`
        WITH hour_range AS (
          SELECT generate_series(
            DATE_TRUNC('day', TIMEZONE(${timezone}, NOW())),
            DATE_TRUNC('day', TIMEZONE(${timezone}, NOW())) + INTERVAL '23 hours',
            '1 hour'::interval
          ) AS hour
        ),
        user_keys AS (
          SELECT id, name, key
          FROM keys
          WHERE user_id = ${userId}
            AND deleted_at IS NULL
        ),
        hourly_stats AS (
          SELECT
            k.id AS key_id,
            k.name AS key_name,
            hr.hour,
            COUNT(mr.id) AS api_calls,
            COALESCE(SUM(mr.cost_usd), 0) AS total_cost
          FROM user_keys k
          CROSS JOIN hour_range hr
          LEFT JOIN message_request mr ON mr.key = k.key
            AND mr.user_id = ${userId}
            AND DATE_TRUNC('hour', mr.created_at AT TIME ZONE ${timezone}) = hr.hour
            AND mr.deleted_at IS NULL
          GROUP BY k.id, k.name, hr.hour
        )
        SELECT
          key_id,
          key_name,
          hour AS date,
          api_calls::integer,
          total_cost::numeric
        FROM hourly_stats
        ORDER BY hour ASC, key_name ASC
      `;
      break;

    case "7days":
      query = sql`
        WITH date_range AS (
          SELECT generate_series(
            (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date - INTERVAL '6 days',
            (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date,
            '1 day'::interval
          )::date AS date
        ),
        user_keys AS (
          SELECT id, name, key
          FROM keys
          WHERE user_id = ${userId}
            AND deleted_at IS NULL
        ),
        daily_stats AS (
          SELECT
            k.id AS key_id,
            k.name AS key_name,
            dr.date,
            COUNT(mr.id) AS api_calls,
            COALESCE(SUM(mr.cost_usd), 0) AS total_cost
          FROM user_keys k
          CROSS JOIN date_range dr
          LEFT JOIN message_request mr ON mr.key = k.key
            AND mr.user_id = ${userId}
            AND (mr.created_at AT TIME ZONE ${timezone})::date = dr.date
            AND mr.deleted_at IS NULL
          GROUP BY k.id, k.name, dr.date
        )
        SELECT
          key_id,
          key_name,
          date,
          api_calls::integer,
          total_cost::numeric
        FROM daily_stats
        ORDER BY date ASC, key_name ASC
      `;
      break;

    case "30days":
      query = sql`
        WITH date_range AS (
          SELECT generate_series(
            (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date - INTERVAL '29 days',
            (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date,
            '1 day'::interval
          )::date AS date
        ),
        user_keys AS (
          SELECT id, name, key
          FROM keys
          WHERE user_id = ${userId}
            AND deleted_at IS NULL
        ),
        daily_stats AS (
          SELECT
            k.id AS key_id,
            k.name AS key_name,
            dr.date,
            COUNT(mr.id) AS api_calls,
            COALESCE(SUM(mr.cost_usd), 0) AS total_cost
          FROM user_keys k
          CROSS JOIN date_range dr
          LEFT JOIN message_request mr ON mr.key = k.key
            AND mr.user_id = ${userId}
            AND (mr.created_at AT TIME ZONE ${timezone})::date = dr.date
            AND mr.deleted_at IS NULL
          GROUP BY k.id, k.name, dr.date
        )
        SELECT
          key_id,
          key_name,
          date,
          api_calls::integer,
          total_cost::numeric
        FROM daily_stats
        ORDER BY date ASC, key_name ASC
      `;
      break;

    default:
      throw new Error(`Unsupported time range: ${timeRange}`);
  }

  const result = await db.execute(query);
  return Array.from(result) as unknown as DatabaseKeyStatRow[];
}

/**
 * 获取指定用户的有效密钥列表
 */
export async function getActiveKeysForUserFromDB(userId: number): Promise<DatabaseKey[]> {
  const query = sql`
    SELECT id, name
    FROM keys
    WHERE user_id = ${userId}
      AND deleted_at IS NULL
    ORDER BY name ASC
  `;

  const result = await db.execute(query);
  return Array.from(result) as unknown as DatabaseKey[];
}

/**
 * 获取混合统计数据：当前用户的密钥明细 + 其他用户的汇总
 * 用于非 admin 用户在 allowGlobalUsageView=true 时的数据展示
 */
export async function getMixedStatisticsFromDB(
  userId: number,
  timeRange: TimeRange
): Promise<{
  ownKeys: DatabaseKeyStatRow[];
  othersAggregate: DatabaseStatRow[];
}> {
  const timezone = getEnvConfig().TZ;
  let ownKeysQuery;
  let othersQuery;

  switch (timeRange) {
    case "today":
      // 自己的密钥明细（小时分辨率）
      ownKeysQuery = sql`
        WITH hour_range AS (
          SELECT generate_series(
            DATE_TRUNC('day', TIMEZONE(${timezone}, NOW())),
            DATE_TRUNC('day', TIMEZONE(${timezone}, NOW())) + INTERVAL '23 hours',
            '1 hour'::interval
          ) AS hour
        ),
        user_keys AS (
          SELECT id, name, key
          FROM keys
          WHERE user_id = ${userId}
            AND deleted_at IS NULL
        ),
        hourly_stats AS (
          SELECT
            k.id AS key_id,
            k.name AS key_name,
            hr.hour,
            COUNT(mr.id) AS api_calls,
            COALESCE(SUM(mr.cost_usd), 0) AS total_cost
          FROM user_keys k
          CROSS JOIN hour_range hr
          LEFT JOIN message_request mr ON mr.key = k.key
            AND mr.user_id = ${userId}
            AND DATE_TRUNC('hour', mr.created_at AT TIME ZONE ${timezone}) = hr.hour
            AND mr.deleted_at IS NULL
          GROUP BY k.id, k.name, hr.hour
        )
        SELECT
          key_id,
          key_name,
          hour AS date,
          api_calls::integer,
          total_cost::numeric
        FROM hourly_stats
        ORDER BY hour ASC, key_name ASC
      `;

      // 其他用户汇总（小时分辨率）
      othersQuery = sql`
        WITH hour_range AS (
          SELECT generate_series(
            DATE_TRUNC('day', TIMEZONE(${timezone}, NOW())),
            DATE_TRUNC('day', TIMEZONE(${timezone}, NOW())) + INTERVAL '23 hours',
            '1 hour'::interval
          ) AS hour
        ),
        hourly_stats AS (
          SELECT
            hr.hour,
            COUNT(mr.id) AS api_calls,
            COALESCE(SUM(mr.cost_usd), 0) AS total_cost
          FROM hour_range hr
          LEFT JOIN message_request mr ON DATE_TRUNC('hour', mr.created_at AT TIME ZONE ${timezone}) = hr.hour
            AND mr.user_id != ${userId}
            AND mr.deleted_at IS NULL
          GROUP BY hr.hour
        )
        SELECT
          -1 AS user_id,
          '其他用户' AS user_name,
          hour AS date,
          api_calls::integer,
          total_cost::numeric
        FROM hourly_stats
        ORDER BY hour ASC
      `;
      break;

    case "7days":
      // 自己的密钥明细（天分辨率）
      ownKeysQuery = sql`
        WITH date_range AS (
          SELECT generate_series(
            (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date - INTERVAL '6 days',
            (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date,
            '1 day'::interval
          )::date AS date
        ),
        user_keys AS (
          SELECT id, name, key
          FROM keys
          WHERE user_id = ${userId}
            AND deleted_at IS NULL
        ),
        daily_stats AS (
          SELECT
            k.id AS key_id,
            k.name AS key_name,
            dr.date,
            COUNT(mr.id) AS api_calls,
            COALESCE(SUM(mr.cost_usd), 0) AS total_cost
          FROM user_keys k
          CROSS JOIN date_range dr
          LEFT JOIN message_request mr ON mr.key = k.key
            AND mr.user_id = ${userId}
            AND (mr.created_at AT TIME ZONE ${timezone})::date = dr.date
            AND mr.deleted_at IS NULL
          GROUP BY k.id, k.name, dr.date
        )
        SELECT
          key_id,
          key_name,
          date,
          api_calls::integer,
          total_cost::numeric
        FROM daily_stats
        ORDER BY date ASC, key_name ASC
      `;

      // 其他用户汇总（天分辨率）
      othersQuery = sql`
        WITH date_range AS (
          SELECT generate_series(
            (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date - INTERVAL '6 days',
            (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date,
            '1 day'::interval
          )::date AS date
        ),
        daily_stats AS (
          SELECT
            dr.date,
            COUNT(mr.id) AS api_calls,
            COALESCE(SUM(mr.cost_usd), 0) AS total_cost
          FROM date_range dr
          LEFT JOIN message_request mr ON (mr.created_at AT TIME ZONE ${timezone})::date = dr.date
            AND mr.user_id != ${userId}
            AND mr.deleted_at IS NULL
          GROUP BY dr.date
        )
        SELECT
          -1 AS user_id,
          '其他用户' AS user_name,
          date,
          api_calls::integer,
          total_cost::numeric
        FROM daily_stats
        ORDER BY date ASC
      `;
      break;

    case "30days":
      // 自己的密钥明细（天分辨率）
      ownKeysQuery = sql`
        WITH date_range AS (
          SELECT generate_series(
            (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date - INTERVAL '29 days',
            (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date,
            '1 day'::interval
          )::date AS date
        ),
        user_keys AS (
          SELECT id, name, key
          FROM keys
          WHERE user_id = ${userId}
            AND deleted_at IS NULL
        ),
        daily_stats AS (
          SELECT
            k.id AS key_id,
            k.name AS key_name,
            dr.date,
            COUNT(mr.id) AS api_calls,
            COALESCE(SUM(mr.cost_usd), 0) AS total_cost
          FROM user_keys k
          CROSS JOIN date_range dr
          LEFT JOIN message_request mr ON mr.key = k.key
            AND mr.user_id = ${userId}
            AND (mr.created_at AT TIME ZONE ${timezone})::date = dr.date
            AND mr.deleted_at IS NULL
          GROUP BY k.id, k.name, dr.date
        )
        SELECT
          key_id,
          key_name,
          date,
          api_calls::integer,
          total_cost::numeric
        FROM daily_stats
        ORDER BY date ASC, key_name ASC
      `;

      // 其他用户汇总（天分辨率）
      othersQuery = sql`
        WITH date_range AS (
          SELECT generate_series(
            (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date - INTERVAL '29 days',
            (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date,
            '1 day'::interval
          )::date AS date
        ),
        daily_stats AS (
          SELECT
            dr.date,
            COUNT(mr.id) AS api_calls,
            COALESCE(SUM(mr.cost_usd), 0) AS total_cost
          FROM date_range dr
          LEFT JOIN message_request mr ON (mr.created_at AT TIME ZONE ${timezone})::date = dr.date
            AND mr.user_id != ${userId}
            AND mr.deleted_at IS NULL
          GROUP BY dr.date
        )
        SELECT
          -1 AS user_id,
          '其他用户' AS user_name,
          date,
          api_calls::integer,
          total_cost::numeric
        FROM daily_stats
        ORDER BY date ASC
      `;
      break;

    default:
      throw new Error(`Unsupported time range: ${timeRange}`);
  }

  const [ownKeysResult, othersResult] = await Promise.all([
    db.execute(ownKeysQuery),
    db.execute(othersQuery),
  ]);

  return {
    ownKeys: Array.from(ownKeysResult) as unknown as DatabaseKeyStatRow[],
    othersAggregate: Array.from(othersResult) as unknown as DatabaseStatRow[],
  };
}

/**
 * 查询用户今日总消费（所有 Key 的消费总和）
 * 用于用户层每日限额检查（Redis 降级）
 */
export async function sumUserCostToday(userId: number): Promise<number> {
  const timezone = getEnvConfig().TZ;

  const query = sql`
    SELECT COALESCE(SUM(mr.cost_usd), 0) AS total_cost
    FROM message_request mr
    INNER JOIN keys k ON mr.key = k.key
    WHERE k.user_id = ${userId}
      AND (mr.created_at AT TIME ZONE ${timezone})::date = (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date
      AND mr.deleted_at IS NULL
      AND k.deleted_at IS NULL
  `;

  const result = await db.execute(query);
  const row = Array.from(result)[0] as { total_cost?: string | number } | undefined;
  return Number(row?.total_cost || 0);
}

/**
 * 查询 Key 今日总消费
 */
export async function sumKeyCostToday(keyId: number): Promise<number> {
  const timezone = getEnvConfig().TZ;

  const keyRecord = await db
    .select({ key: keys.key })
    .from(keys)
    .where(eq(keys.id, keyId))
    .limit(1);

  const keyString = keyRecord[0]?.key;
  if (!keyString) {
    return 0;
  }

  const query = sql`
    SELECT COALESCE(SUM(mr.cost_usd), 0) AS total_cost
    FROM message_request mr
    WHERE mr.key = ${keyString}
      AND (mr.created_at AT TIME ZONE ${timezone})::date = (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date
      AND mr.deleted_at IS NULL
  `;

  const result = await db.execute(query);
  const row = Array.from(result)[0] as { total_cost?: string | number } | undefined;
  return Number(row?.total_cost || 0);
}

/**
 * 查询 Key 在指定时间范围内的消费总和
 * 用于 Key 层限额检查（Redis 降级）
 */
export async function sumKeyCostInTimeRange(
  keyId: number,
  startTime: Date,
  endTime: Date
): Promise<number> {
  // 注意：message_request.key 存储的是 API key 字符串，需要先查询 keys 表获取 key 值
  const keyRecord = await db
    .select({ key: keys.key })
    .from(keys)
    .where(eq(keys.id, keyId))
    .limit(1);

  if (!keyRecord || keyRecord.length === 0) return 0;

  const keyString = keyRecord[0].key;

  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${messageRequest.costUsd}), 0)` })
    .from(messageRequest)
    .where(
      and(
        eq(messageRequest.key, keyString), // 使用 key 字符串而非 ID
        gte(messageRequest.createdAt, startTime),
        lt(messageRequest.createdAt, endTime),
        isNull(messageRequest.deletedAt)
      )
    );

  return Number(result[0]?.total || 0);
}

/**
 * 查询 Provider 在指定时间范围内的消费总和
 * 用于 Provider 层限额检查（Redis 降级）
 */
export async function sumProviderCostInTimeRange(
  providerId: number,
  startTime: Date,
  endTime: Date
): Promise<number> {
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${messageRequest.costUsd}), 0)` })
    .from(messageRequest)
    .where(
      and(
        eq(messageRequest.providerId, providerId),
        gte(messageRequest.createdAt, startTime),
        lt(messageRequest.createdAt, endTime),
        isNull(messageRequest.deletedAt)
      )
    );

  return Number(result[0]?.total || 0);
}

/**
 * 查询指定供应商类型的近 N 天趋势（按供应商账号聚合）
 */
export async function getProviderUsageTrendsFromDB(
  providerType: ProviderType,
  days = 7
): Promise<{ providerMeta: { id: number; name: string }[]; rows: ProviderTrendRow[]; days: number }> {
  const timezone = getEnvConfig().TZ;
  const clampedDays = Math.max(1, Math.min(days, 30));

  const providerMeta = await db
    .select({ id: providers.id, name: providers.name })
    .from(providers)
    .where(
      and(eq(providers.providerType, providerType), eq(providers.isEnabled, true), isNull(providers.deletedAt))
    );

  if (providerMeta.length === 0) {
    return { providerMeta: [], rows: [], days: clampedDays };
  }

  // 使用 SQL INTERVAL 表达式而不是 JavaScript Date 对象
  // 这样可以避免 Drizzle ORM 的日期类型转换问题
  const daysOffset = clampedDays - 1;

  // 供应商级别聚合查询
  const usageQuery = sql`
    WITH date_range AS (
      SELECT generate_series(
        (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date - INTERVAL '${sql.raw(daysOffset.toString())} days',
        (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date,
        '1 day'::interval
      )::date AS date
    ),
    provider_list AS (
      SELECT id, name
      FROM providers
      WHERE provider_type = ${providerType}
        AND is_enabled = true
        AND deleted_at IS NULL
    )
    SELECT
      pl.id AS provider_id,
      pl.name AS provider_name,
      dr.date,
      COUNT(mr.id) AS api_calls,
      COALESCE(SUM(mr.cost_usd), 0) AS total_cost
    FROM provider_list pl
    CROSS JOIN date_range dr
    LEFT JOIN message_request mr ON mr.provider_id = pl.id
      AND mr.deleted_at IS NULL
      AND DATE_TRUNC('day', mr.created_at AT TIME ZONE ${timezone})::date = dr.date
    GROUP BY pl.id, pl.name, dr.date
    ORDER BY pl.id, dr.date
  `;

  const usageResult = await db.execute(usageQuery);

  return {
    providerMeta,
    rows: Array.from(usageResult) as unknown as ProviderTrendRow[],
    days: clampedDays,
  };
}

/**
 * 查询近 N 天内使用量 Top 7 的 Keys 趋势
 */
export async function getTopKeysUsageTrendsFromDB(
  days = 7
): Promise<{ keyMeta: { id: number; name: string }[]; rows: KeyTrendRow[]; days: number }> {
  const timezone = getEnvConfig().TZ;
  const clampedDays = Math.max(1, Math.min(days, 30));
  const daysOffset = clampedDays - 1;

  // 先查询 Top 7 的 Keys（按总消费排序）
  const topKeysQuery = sql`
    SELECT
      k.id,
      k.name,
      COALESCE(SUM(mr.cost_usd), 0) AS total_cost
    FROM keys k
    LEFT JOIN message_request mr ON mr.key = k.key
      AND mr.deleted_at IS NULL
      AND mr.created_at >= (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date - INTERVAL '${sql.raw(daysOffset.toString())} days'
      AND mr.created_at < (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date + INTERVAL '1 day'
    WHERE k.deleted_at IS NULL
    GROUP BY k.id, k.name
    HAVING COALESCE(SUM(mr.cost_usd), 0) > 0
    ORDER BY total_cost DESC
    LIMIT 7
  `;

  const topKeysResult = await db.execute(topKeysQuery);
  const keyMeta = Array.from(topKeysResult) as unknown as { id: number; name: string; total_cost: string }[];

  if (keyMeta.length === 0) {
    return { keyMeta: [], rows: [], days: clampedDays };
  }

  // 查询这些 Keys 在每天的详细数据
  const keyIds = keyMeta.map((k) => k.id);
  const usageQuery = sql`
    WITH date_range AS (
      SELECT generate_series(
        (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date - INTERVAL '${sql.raw(daysOffset.toString())} days',
        (CURRENT_TIMESTAMP AT TIME ZONE ${timezone})::date,
        '1 day'::interval
      )::date AS date
    ),
    key_list AS (
      SELECT id, name
      FROM keys
      WHERE id = ANY(ARRAY[${sql.raw(keyIds.join(","))}]::integer[])
        AND deleted_at IS NULL
    )
    SELECT
      kl.id AS key_id,
      kl.name AS key_name,
      dr.date,
      COUNT(mr.id) AS api_calls,
      COALESCE(SUM(mr.cost_usd), 0) AS total_cost
    FROM key_list kl
    CROSS JOIN date_range dr
    LEFT JOIN message_request mr ON mr.key = (SELECT k.key FROM keys k WHERE k.id = kl.id LIMIT 1)
      AND mr.deleted_at IS NULL
      AND DATE_TRUNC('day', mr.created_at AT TIME ZONE ${timezone})::date = dr.date
    GROUP BY kl.id, kl.name, dr.date
    ORDER BY kl.id, dr.date
  `;

  const usageResult = await db.execute(usageQuery);

  return {
    keyMeta: keyMeta.map((k) => ({ id: k.id, name: k.name })),
    rows: Array.from(usageResult) as unknown as KeyTrendRow[],
    days: clampedDays,
  };
}

