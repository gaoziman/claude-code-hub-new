import { getRedisClient } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { SessionTracker } from "@/lib/session-tracker";
import {
  CHECK_AND_TRACK_SESSION,
  TRACK_COST_5H_ROLLING_WINDOW,
  GET_COST_5H_ROLLING_WINDOW,
} from "@/lib/redis/lua-scripts";
import { sumKeyCostToday } from "@/repository/statistics";
import { getTimeRangeForPeriod, getTTLForPeriod, getSecondsUntilMidnight, getTimeRangeForBillingPeriod } from "./time-utils";

interface CostLimit {
  amount: number | null | undefined;
  period: "5h" | "weekly" | "monthly" | "total";
  name: string;
}

export class RateLimitService {
  private static redis = getRedisClient();

  /**
   * 检查金额限制（User、Owner Key Aggregate、Key 或 Provider）
   * 优先使用 Redis，失败时降级到数据库查询（防止 Redis 清空后超支）
   *
   * @param billingCycleStart 账期起始日期（可选）
   *   - 如果提供：使用账期周期计算周/月限额，直接查询数据库（准确性优先）
   *   - 如果未提供：使用自然周/月周期，优先使用 Redis 缓存（性能优先）
   */
  static async checkCostLimits(
    id: number,
    type: "user" | "owner_key_aggregate" | "key" | "provider",
    limits: {
      limit_5h_usd?: number | null;
      limit_weekly_usd?: number | null;
      limit_monthly_usd?: number | null;
      total_limit_usd?: number | null;
    },
    billingCycleStart?: Date | null
  ): Promise<{ allowed: boolean; reason?: string; current?: number }> {
    const costLimits: CostLimit[] = [
      { amount: limits.limit_5h_usd, period: "5h", name: "5小时" },
      { amount: limits.limit_weekly_usd, period: "weekly", name: "周" },
      { amount: limits.limit_monthly_usd, period: "monthly", name: "月" },
      { amount: limits.total_limit_usd ?? null, period: "total", name: "总计" },
    ];

    // 如果设置了账期起始日期，且有周/月限额，直接使用数据库查询（账期周期准确性优先）
    // 因为 Redis 的 key 是基于自然周/月的，无法精确匹配账期周期
    const hasWeeklyOrMonthlyLimit =
      (limits.limit_weekly_usd && limits.limit_weekly_usd > 0) ||
      (limits.limit_monthly_usd && limits.limit_monthly_usd > 0);

    if (billingCycleStart && hasWeeklyOrMonthlyLimit) {
      logger.debug(
        `[RateLimit] Using billing cycle for ${type}:${id}, billingCycleStart: ${billingCycleStart.toISOString()}`
      );
      return await this.checkCostLimitsFromDatabase(id, type, costLimits, billingCycleStart);
    }

    try {
      // Fast Path: Redis 查询（仅限自然周期模式）
      if (this.redis && this.redis.status === "ready") {
        const now = Date.now();
        const window5h = 5 * 60 * 60 * 1000; // 5 hours in ms

        for (const limit of costLimits) {
          if (!limit.amount || limit.amount <= 0) continue;

          let current = 0;

          // 5h 使用滚动窗口 Lua 脚本
          if (limit.period === "5h") {
            try {
              const key = `${type}:${id}:cost_5h_rolling`;
              const result = (await this.redis.eval(
                GET_COST_5H_ROLLING_WINDOW,
                1, // KEYS count
                key, // KEYS[1]
                now.toString(), // ARGV[1]: now
                window5h.toString() // ARGV[2]: window
              )) as string;

              current = parseFloat(result || "0");

              // Cache Miss 检测：如果返回 0 但 Redis 中没有 key，从数据库恢复
              if (current === 0) {
                const exists = await this.redis.exists(key);
                if (!exists) {
                  logger.info(
                    `[RateLimit] Cache miss for ${type}:${id}:cost_5h, querying database`
                  );
                  return await this.checkCostLimitsFromDatabase(id, type, costLimits);
                }
              }
            } catch (error) {
              logger.error(
                "[RateLimit] 5h rolling window query failed, fallback to database:",
                error
              );
              return await this.checkCostLimitsFromDatabase(id, type, costLimits);
            }
          } else if (limit.period === "total") {
            const value = await this.redis.get(`${type}:${id}:total_cost`);
            if (value === null && limit.amount > 0) {
              logger.info(`[RateLimit] Cache miss for ${type}:${id}:total_cost, querying database`);
              return await this.checkCostLimitsFromDatabase(id, type, costLimits);
            }

            current = parseFloat((value as string) || "0");
          } else {
            // 周/月使用普通 GET
            const value = await this.redis.get(`${type}:${id}:cost_${limit.period}`);

            // Cache Miss 检测
            if (value === null && limit.amount > 0) {
              logger.info(
                `[RateLimit] Cache miss for ${type}:${id}:cost_${limit.period}, querying database`
              );
              return await this.checkCostLimitsFromDatabase(id, type, costLimits);
            }

            current = parseFloat((value as string) || "0");
          }

          if (current >= limit.amount) {
            return {
              allowed: false,
              reason: `${type === "key" ? "Key" : "供应商"} ${limit.name}消费上限已达到（${current.toFixed(4)}/${limit.amount}）`,
            };
          }
        }

        return { allowed: true };
      }

      // Slow Path: Redis 不可用，降级到数据库
      logger.warn(`[RateLimit] Redis unavailable, checking ${type} cost limits from database`);
      return await this.checkCostLimitsFromDatabase(id, type, costLimits);
    } catch (error) {
      logger.error("[RateLimit] Check failed, fallback to database:", error);
      return await this.checkCostLimitsFromDatabase(id, type, costLimits);
    }
  }

  /**
   * 从数据库检查金额限制（降级路径）
   *
   * @param billingCycleStart 账期起始日期（可选）
   *   - 如果提供：使用账期周期计算周/月限额时间范围
   *   - 如果未提供：使用自然周/月周期
   */
  private static async checkCostLimitsFromDatabase(
    id: number,
    type: "user" | "owner_key_aggregate" | "key" | "provider",
    costLimits: CostLimit[],
    billingCycleStart?: Date | null
  ): Promise<{ allowed: boolean; reason?: string }> {
    const {
      sumKeyCostInTimeRange,
      sumProviderCostInTimeRange,
      sumUserCostInTimeRange,
      sumOwnerKeyAggregateCostInTimeRange,
    } = await import("@/repository/statistics");

    for (const limit of costLimits) {
      if (!limit.amount || limit.amount <= 0) continue;

      // 计算时间范围
      // - 如果有 billingCycleStart：使用账期周期
      // - 否则：使用自然周/月周期
      const { startTime, endTime } =
        limit.period === "total"
          ? { startTime: new Date(0), endTime: new Date() }
          : getTimeRangeForBillingPeriod(limit.period, billingCycleStart);

      // 查询数据库
      let current: number;
      if (type === "key") {
        current = await sumKeyCostInTimeRange(id, startTime, endTime);
      } else if (type === "provider") {
        current = await sumProviderCostInTimeRange(id, startTime, endTime);
      } else if (type === "user") {
        current = await sumUserCostInTimeRange(id, startTime, endTime);
      } else if (type === "owner_key_aggregate") {
        current = await sumOwnerKeyAggregateCostInTimeRange(id, startTime, endTime);
      } else {
        // 不应该走到这里，TypeScript 类型检查会保证
        throw new Error(`Unsupported type: ${type}`);
      }

      // Cache Warming: 写回 Redis
      if (this.redis && this.redis.status === "ready") {
        try {
          if (limit.period === "5h") {
            // 5h 滚动窗口：使用 ZSET + Lua 脚本
            if (current > 0) {
              const now = Date.now();
              const window5h = 5 * 60 * 60 * 1000;
              const key = `${type}:${id}:cost_5h_rolling`;

              await this.redis.eval(
                TRACK_COST_5H_ROLLING_WINDOW,
                1,
                key,
                current.toString(),
                now.toString(),
                window5h.toString()
              );

              logger.info(`[RateLimit] Cache warmed for ${key}, value=${current} (rolling window)`);
            }
          } else if (limit.period === "total") {
            await this.redis.set(`${type}:${id}:total_cost`, current.toString());
            logger.info(`[RateLimit] Cache warmed for ${type}:${id}:total_cost, value=${current}`);
          } else {
            // 周/月固定窗口：使用 STRING + 动态 TTL
            const ttl = getTTLForPeriod(limit.period);
            await this.redis.set(
              `${type}:${id}:cost_${limit.period}`,
              current.toString(),
              "EX",
              ttl
            );
            logger.info(
              `[RateLimit] Cache warmed for ${type}:${id}:cost_${limit.period}, value=${current}, ttl=${ttl}s`
            );
          }
        } catch (error) {
          logger.error("[RateLimit] Failed to warm cache:", error);
        }
      }

      if (current >= limit.amount) {
        return {
          allowed: false,
          reason: `${type === "key" ? "Key" : "供应商"} ${limit.name}消费上限已达到（${current.toFixed(4)}/${limit.amount}）`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * 检查并发 Session 限制（仅检查，不追踪）
   *
   * 注意：此方法仅用于非供应商级别的限流检查（如 key 级）
   * 供应商级别请使用 checkAndTrackProviderSession 保证原子性
   */
  static async checkSessionLimit(
    id: number,
    type: "key" | "provider",
    limit: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (limit <= 0) {
      return { allowed: true };
    }

    try {
      // 使用 SessionTracker 的统一计数逻辑
      const count =
        type === "key"
          ? await SessionTracker.getKeySessionCount(id)
          : await SessionTracker.getProviderSessionCount(id);

      if (count >= limit) {
        return {
          allowed: false,
          reason: `${type === "key" ? "Key" : "供应商"}并发 Session 上限已达到（${count}/${limit}）`,
        };
      }

      return { allowed: true };
    } catch (error) {
      logger.error("[RateLimit] Session check failed:", error);
      return { allowed: true }; // Fail Open
    }
  }

  /**
   * 原子性检查并追踪供应商 Session（解决竞态条件）
   *
   * 使用 Lua 脚本保证"检查 + 追踪"的原子性，防止并发请求同时通过限制检查
   *
   * @param providerId - Provider ID
   * @param sessionId - Session ID
   * @param limit - 并发限制
   * @returns { allowed, count, tracked } - 是否允许、当前并发数、是否已追踪
   */
  static async checkAndTrackProviderSession(
    providerId: number,
    sessionId: string,
    limit: number
  ): Promise<{ allowed: boolean; count: number; tracked: boolean; reason?: string }> {
    if (limit <= 0) {
      return { allowed: true, count: 0, tracked: false };
    }

    if (!this.redis || this.redis.status !== "ready") {
      logger.warn("[RateLimit] Redis not ready, Fail Open");
      return { allowed: true, count: 0, tracked: false };
    }

    try {
      const key = `provider:${providerId}:active_sessions`;
      const now = Date.now();

      // 执行 Lua 脚本：原子性检查 + 追踪（TC-041 修复版）
      const result = (await this.redis.eval(
        CHECK_AND_TRACK_SESSION,
        1, // KEYS count
        key, // KEYS[1]
        sessionId, // ARGV[1]
        limit.toString(), // ARGV[2]
        now.toString() // ARGV[3]
      )) as [number, number, number];

      const [allowed, count, tracked] = result;

      if (allowed === 0) {
        return {
          allowed: false,
          count,
          tracked: false,
          reason: `供应商并发 Session 上限已达到（${count}/${limit}）`,
        };
      }

      return {
        allowed: true,
        count,
        tracked: tracked === 1, // Lua 返回 1 表示新追踪，0 表示已存在
      };
    } catch (error) {
      logger.error("[RateLimit] Atomic check-and-track failed:", error);
      return { allowed: true, count: 0, tracked: false }; // Fail Open
    }
  }

  /**
   * 累加消费（请求结束后调用）
   * 5h 使用滚动窗口（ZSET），周/月使用固定窗口（STRING）
   *
   * @param id - 实体 ID（keyId/providerId/userId/ownerKeyId，取决于 type）
   * @param providerId - 供应商 ID（仅用于日志记录，不参与 Redis key 生成）
   * @param sessionId - Session ID（仅用于日志记录）
   * @param cost - 成本金额
   * @param type - 追踪类型：user/owner_key_aggregate/key/provider
   */
  static async trackCost(
    id: number,
    providerId: number,
    sessionId: string,
    cost: number,
    type: "user" | "owner_key_aggregate" | "key" | "provider" = "key"
  ): Promise<void> {
    if (!this.redis || cost <= 0) return;

    try {
      const now = Date.now();
      const window5h = 5 * 60 * 60 * 1000; // 5 hours in ms

      // 计算动态 TTL（周/月）
      const ttlWeekly = getTTLForPeriod("weekly");
      const ttlMonthly = getTTLForPeriod("monthly");
      const secondsUntilMidnight = getSecondsUntilMidnight();

      // 1. 5h 滚动窗口：使用 Lua 脚本（ZSET）
      await this.redis.eval(
        TRACK_COST_5H_ROLLING_WINDOW,
        1,
        `${type}:${id}:cost_5h_rolling`, // 动态前缀
        cost.toString(),
        now.toString(),
        window5h.toString()
      );

      // 2. 周/月固定窗口：使用 STRING + 动态 TTL
      const pipeline = this.redis.pipeline();

      pipeline.incrbyfloat(`${type}:${id}:cost_weekly`, cost);
      pipeline.expire(`${type}:${id}:cost_weekly`, ttlWeekly);

      pipeline.incrbyfloat(`${type}:${id}:cost_monthly`, cost);
      pipeline.expire(`${type}:${id}:cost_monthly`, ttlMonthly);

      // 总消费（无过期）
      pipeline.incrbyfloat(`${type}:${id}:total_cost`, cost);

      // 每日消费（仅 key 类型需要，用于每日限额检查）
      if (type === "key") {
        pipeline.incrbyfloat(`key:${id}:daily_cost`, cost);
        pipeline.expire(`key:${id}:daily_cost`, secondsUntilMidnight);
      }

      await pipeline.exec();

      logger.debug(
        `[RateLimit] Tracked cost: type=${type}, id=${id}, provider=${providerId}, cost=${cost}`
      );
    } catch (error) {
      logger.error("[RateLimit] Track cost failed:", error);
      // 不抛出错误，静默失败
    }
  }

  /**
   * 获取当前消费（用于响应头和前端展示）
   * 优先使用 Redis，失败时降级到数据库查询
   */
  static async getCurrentCost(
    id: number,
    type: "key" | "provider",
    period: "5h" | "weekly" | "monthly"
  ): Promise<number> {
    try {
      // Fast Path: Redis 查询
      if (this.redis && this.redis.status === "ready") {
        let current = 0;

        // 5h 使用滚动窗口 Lua 脚本
        if (period === "5h") {
          const now = Date.now();
          const window5h = 5 * 60 * 60 * 1000;
          const key = `${type}:${id}:cost_5h_rolling`;

          const result = (await this.redis.eval(
            GET_COST_5H_ROLLING_WINDOW,
            1,
            key,
            now.toString(),
            window5h.toString()
          )) as string;

          current = parseFloat(result || "0");

          // Cache Hit
          if (current > 0) {
            return current;
          }

          // Cache Miss 检测：如果返回 0 但 Redis 中没有 key，从数据库恢复
          const exists = await this.redis.exists(key);
          if (!exists) {
            logger.info(`[RateLimit] Cache miss for ${type}:${id}:cost_5h, querying database`);
          } else {
            // Key 存在但值为 0，说明真的是 0
            return 0;
          }
        } else {
          // 周/月使用普通 GET
          const value = await this.redis.get(`${type}:${id}:cost_${period}`);

          // Cache Hit
          if (value !== null) {
            return parseFloat(value || "0");
          }

          // Cache Miss: 从数据库恢复
          logger.info(`[RateLimit] Cache miss for ${type}:${id}:cost_${period}, querying database`);
        }
      } else {
        logger.warn(`[RateLimit] Redis unavailable, querying database for ${type} cost`);
      }

      // Slow Path: 数据库查询
      const { sumKeyCostInTimeRange, sumProviderCostInTimeRange } = await import(
        "@/repository/statistics"
      );

      const { startTime, endTime } = getTimeRangeForPeriod(period);
      const current =
        type === "key"
          ? await sumKeyCostInTimeRange(id, startTime, endTime)
          : await sumProviderCostInTimeRange(id, startTime, endTime);

      // Cache Warming: 写回 Redis
      if (this.redis && this.redis.status === "ready") {
        try {
          if (period === "5h") {
            // 5h 滚动窗口：需要将历史数据转换为 ZSET 格式
            // 由于无法精确知道每次消费的时间戳，使用当前时间作为近似
            if (current > 0) {
              const now = Date.now();
              const window5h = 5 * 60 * 60 * 1000;
              const key = `${type}:${id}:cost_5h_rolling`;

              // 将数据库查询到的总额作为单条记录写入
              await this.redis.eval(
                TRACK_COST_5H_ROLLING_WINDOW,
                1,
                key,
                current.toString(),
                now.toString(),
                window5h.toString()
              );

              logger.info(`[RateLimit] Cache warmed for ${key}, value=${current} (rolling window)`);
            }
          } else {
            // 周/月固定窗口：使用 STRING + 动态 TTL
            const ttl = getTTLForPeriod(period);
            await this.redis.set(`${type}:${id}:cost_${period}`, current.toString(), "EX", ttl);
            logger.info(
              `[RateLimit] Cache warmed for ${type}:${id}:cost_${period}, value=${current}, ttl=${ttl}s`
            );
          }
        } catch (error) {
          logger.error("[RateLimit] Failed to warm cache:", error);
        }
      }

      return current;
    } catch (error) {
      logger.error("[RateLimit] Get cost failed:", error);
      return 0;
    }
  }

  /**
   * 检查 Key RPM（每分钟请求数）限制
   * 使用 Redis ZSET 实现滑动窗口
   */
  static async checkKeyRPM(
    keyId: number,
    rpmLimit: number | null | undefined
  ): Promise<{ allowed: boolean; reason?: string; current?: number }> {
    if (!rpmLimit || rpmLimit <= 0) {
      return { allowed: true }; // 未设置限制
    }

    if (!this.redis) {
      logger.warn("[RateLimit] Redis unavailable, skipping key RPM check");
      return { allowed: true }; // Fail Open
    }

    const key = `key:${keyId}:rpm_window`;
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    try {
      // 使用 Pipeline 提高性能
      const pipeline = this.redis.pipeline();

      // 1. 清理 1 分钟前的请求
      pipeline.zremrangebyscore(key, "-inf", oneMinuteAgo);

      // 2. 统计当前请求数
      pipeline.zcard(key);

      const results = await pipeline.exec();
      const count = (results?.[1]?.[1] as number) || 0;

      if (count >= rpmLimit) {
        return {
          allowed: false,
          reason: `Key 每分钟请求数上限已达到（${count}/${rpmLimit}）`,
          current: count,
        };
      }

      // 3. 记录本次请求
      await this.redis
        .pipeline()
        .zadd(key, now, `${now}:${Math.random()}`)
        .expire(key, 120) // 2 分钟 TTL
        .exec();

      return { allowed: true, current: count + 1 };
    } catch (error) {
      logger.error(`[RateLimit] Key RPM check failed for key ${keyId}:`, error);
      return { allowed: true }; // Fail Open
    }
  }

  /**
   * 检查 Key 每日消费额度限制
   * 优先使用 Redis，失败时降级到数据库查询
   */
  static async checkKeyDailyCost(
    keyId: number,
    dailyLimitUsd: number | null | undefined
  ): Promise<{ allowed: boolean; reason?: string; current?: number }> {
    if (!dailyLimitUsd || dailyLimitUsd <= 0) {
      return { allowed: true }; // 未设置限制
    }

    const key = `key:${keyId}:daily_cost`;
    let currentCost = 0;

    try {
      // Fast Path: Redis 查询
      if (this.redis) {
        const cached = await this.redis.get(key);
        if (cached !== null) {
          currentCost = parseFloat(cached);
        } else {
          // Cache Miss: 从数据库恢复
          logger.info(`[RateLimit] Cache miss for ${key}, querying database`);
          currentCost = await sumKeyCostToday(keyId);

          // Cache Warming: 写回 Redis（使用新的时间工具函数）
          const secondsUntilMidnight = getSecondsUntilMidnight();
          await this.redis.set(key, currentCost.toString(), "EX", secondsUntilMidnight);
        }
      } else {
        // Slow Path: 数据库查询（Redis 不可用）
        logger.warn("[RateLimit] Redis unavailable, querying database for user daily cost");
        currentCost = await sumKeyCostToday(keyId);
      }

      if (currentCost >= dailyLimitUsd) {
        return {
          allowed: false,
          reason: `Key 每日消费上限已达到（$${currentCost.toFixed(4)}/$${dailyLimitUsd}）`,
          current: currentCost,
        };
      }

      return { allowed: true, current: currentCost };
    } catch (error) {
      logger.error(`[RateLimit] Key daily cost check failed for key ${keyId}:`, error);
      return { allowed: true }; // Fail Open
    }
  }

  /**
   * 获取 Key 当前 RPM 使用情况（近似值）
   */
  static async getKeyRPMUsage(keyId: number): Promise<number> {
    if (!this.redis || this.redis.status !== "ready") {
      return 0;
    }

    const key = `key:${keyId}:rpm_window`;
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    try {
      await this.redis.zremrangebyscore(key, "-inf", oneMinuteAgo);
      const count = await this.redis.zcard(key);
      return count;
    } catch (error) {
      logger.error(`[RateLimit] Failed to query key RPM usage: key=${keyId}`, error);
      return 0;
    }
  }

  /**
   * 获取 Key 当日消费
   */
  static async getKeyDailyCost(keyId: number): Promise<number> {
    const redisKey = `key:${keyId}:daily_cost`;

    if (this.redis && this.redis.status === "ready") {
      const cached = await this.redis.get(redisKey);
      if (cached !== null) {
        return parseFloat(cached);
      }
    }

    const current = await sumKeyCostToday(keyId);

    if (this.redis && this.redis.status === "ready") {
      try {
        const secondsUntilMidnight = getSecondsUntilMidnight();
        await this.redis.set(redisKey, current.toString(), "EX", secondsUntilMidnight);
      } catch (error) {
        logger.error("[RateLimit] Failed to warm daily cost cache:", error);
      }
    }

    return current;
  }

  /**
   * 检查用户成本限额（套餐 + 余额双轨）
   *
   * 业务场景：
   * - 用户有周/月套餐限额 + 按量付费余额
   * - 优先从套餐中扣款，套餐用完后从余额扣款
   *
   * @param userId - 用户ID
   * @param limits - 用户套餐限额配置
   * @param balanceUsd - 用户当前余额（美元）
   * @param estimatedCost - 预估本次请求成本
   * @returns 检查结果 + 支付策略
   */
  static async checkUserCostWithBalance(
    userId: number,
    limits: {
      limit_5h_usd?: number | null;
      limit_weekly_usd?: number | null;
      limit_monthly_usd?: number | null;
      total_limit_usd?: number | null;
    },
    balanceUsd: number,
    estimatedCost: number,
    billingCycleStart?: Date | null
  ): Promise<{
    allowed: boolean;
    reason?: string;
    paymentStrategy?: {
      fromPackage: number; // 从套餐中扣除的金额
      fromBalance: number; // 从余额中扣除的金额
      source: 'package' | 'balance' | 'mixed'; // 支付来源
    };
  }> {
    // 1. 检查套餐限额（5h/周/月/总计）
    // 传递 billingCycleStart 以确保使用账期周期计算（从数据库查询准确值）
    const packageCheck = await this.checkCostLimits(userId, "user", limits, billingCycleStart);

    // 如果套餐限额检查失败，尝试使用余额支付
    if (!packageCheck.allowed) {
      // 套餐已用尽，检查余额是否足够
      if (balanceUsd >= estimatedCost) {
        return {
          allowed: true,
          paymentStrategy: {
            fromPackage: 0,
            fromBalance: estimatedCost,
            source: 'balance',
          },
        };
      } else {
        // 套餐用尽且余额不足
        return {
          allowed: false,
          reason: `套餐已用尽且余额不足（余额: $${balanceUsd.toFixed(4)}, 需要: $${estimatedCost.toFixed(4)}）`,
        };
      }
    }

    // 2. 套餐限额检查通过，计算剩余配额（保守估计）
    const costLimits: CostLimit[] = [
      { amount: limits.limit_5h_usd, period: "5h", name: "5小时" },
      { amount: limits.limit_weekly_usd, period: "weekly", name: "周" },
      { amount: limits.limit_monthly_usd, period: "monthly", name: "月" },
      { amount: limits.total_limit_usd ?? null, period: "total", name: "总计" },
    ];

    // 计算每个限额的剩余额度
    let minRemaining = Infinity;
    let hasAnyLimit = false;

    try {
      if (this.redis && this.redis.status === "ready") {
        const now = Date.now();
        const window5h = 5 * 60 * 60 * 1000;

        for (const limit of costLimits) {
          if (!limit.amount || limit.amount <= 0) continue;
          hasAnyLimit = true;

          let current = 0;

          if (limit.period === "5h") {
            const key = `user:${userId}:cost_5h_rolling`;
            const result = (await this.redis.eval(
              GET_COST_5H_ROLLING_WINDOW,
              1,
              key,
              now.toString(),
              window5h.toString()
            )) as string;
            current = parseFloat(result || "0");
          } else if (limit.period === "total") {
            const value = await this.redis.get(`user:${userId}:total_cost`);
            current = parseFloat((value as string) || "0");
          } else {
            const value = await this.redis.get(`user:${userId}:cost_${limit.period}`);
            current = parseFloat((value as string) || "0");
          }

          const remaining = limit.amount - current;
          if (remaining < minRemaining) {
            minRemaining = remaining;
          }
        }
      } else {
        // Redis 不可用，从数据库查询
        logger.warn("[RateLimit] Redis unavailable for balance check, querying database");

        const {
          sumUserCostInTimeRange,
        } = await import("@/repository/statistics");

        for (const limit of costLimits) {
          if (!limit.amount || limit.amount <= 0) continue;
          hasAnyLimit = true;

          const { startTime, endTime } =
            limit.period === "total"
              ? { startTime: new Date(0), endTime: new Date() }
              : getTimeRangeForPeriod(limit.period);

          const current = await sumUserCostInTimeRange(userId, startTime, endTime);
          const remaining = limit.amount - current;

          if (remaining < minRemaining) {
            minRemaining = remaining;
          }
        }
      }
    } catch (error) {
      logger.error("[RateLimit] Failed to calculate package remaining:", error);
      // 计算失败，降级为纯余额支付
      if (balanceUsd >= estimatedCost) {
        return {
          allowed: true,
          paymentStrategy: {
            fromPackage: 0,
            fromBalance: estimatedCost,
            source: 'balance',
          },
        };
      } else {
        return {
          allowed: false,
          reason: `余额不足（余额: $${balanceUsd.toFixed(4)}, 需要: $${estimatedCost.toFixed(4)}）`,
        };
      }
    }

    // 3. 如果没有设置任何套餐限额，纯余额支付
    if (!hasAnyLimit) {
      if (balanceUsd >= estimatedCost) {
        return {
          allowed: true,
          paymentStrategy: {
            fromPackage: 0,
            fromBalance: estimatedCost,
            source: 'balance',
          },
        };
      } else {
        return {
          allowed: false,
          reason: `余额不足（余额: $${balanceUsd.toFixed(4)}, 需要: $${estimatedCost.toFixed(4)}）`,
        };
      }
    }

    // 4. 计算支付策略
    if (minRemaining >= estimatedCost) {
      // 套餐剩余额度足够，全部从套餐支付
      return {
        allowed: true,
        paymentStrategy: {
          fromPackage: estimatedCost,
          fromBalance: 0,
          source: 'package',
        },
      };
    } else {
      // 套餐剩余额度不足，需要混合支付
      const fromPackage = Math.max(0, minRemaining); // 套餐中可用的部分
      const fromBalance = estimatedCost - fromPackage; // 余额中需要支付的部分

      // 检查余额是否足够
      if (balanceUsd >= fromBalance) {
        return {
          allowed: true,
          paymentStrategy: {
            fromPackage,
            fromBalance,
            source: 'mixed',
          },
        };
      } else {
        return {
          allowed: false,
          reason: `套餐剩余 $${fromPackage.toFixed(4)}，余额不足（需要 $${fromBalance.toFixed(4)}, 当前 $${balanceUsd.toFixed(4)}）`,
        };
      }
    }
  }
}
