import { getRedisClient } from "@/lib/redis/client";
import { logger } from "@/lib/logger";
import { sumKeyCostInTimeRange, sumKeyCostToday } from "@/repository/statistics";
import { findKeyList } from "@/repository/key";
import type {
  ConsistencyCheckItem,
  ConsistencyCheckResult,
  ConsistencyDimension,
  CheckConsistencyRequest,
} from "@/types/consistency";

/**
 * 根据维度获取时间范围
 */
function getTimeRangeForPeriod(dimension: ConsistencyDimension): {
  startTime: Date;
  endTime: Date;
} {
  const now = new Date();
  const endTime = now;
  let startTime: Date;

  switch (dimension) {
    case "5h":
      // 最近 5 小时
      startTime = new Date(now.getTime() - 5 * 60 * 60 * 1000);
      break;
    case "weekly":
      // 最近 7 天
      startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "monthly":
      // 最近 30 天
      startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      // daily 和 total 不应该调用这个函数
      startTime = now;
  }

  return { startTime, endTime };
}

/**
 * 数据一致性服务
 * 负责检测和修复 Redis 缓存与数据库之间的数据不一致问题
 */
export class ConsistencyService {
  /**
   * 检测所有 Key 的数据一致性
   */
  static async checkAll(request?: CheckConsistencyRequest): Promise<ConsistencyCheckResult> {
    const startTime = Date.now();
    logger.info("[Consistency] 开始检测数据一致性", request);

    try {
      // 1. 获取所有活跃的 Key
      // TODO: 需要实现一个获取所有 Key 的方法，暂时使用空数组模拟
      const allKeys: Array<{ id: number; userId: number; name: string }> = [];

      // 获取第一个用户的所有 Key 作为示例
      // 生产环境需要遍历所有用户
      if (!request?.keyIds || request.keyIds.length === 0) {
        // 获取用户 ID 为 1 的所有 Key（示例）
        const userKeys = await findKeyList(1);
        allKeys.push(...userKeys.map((k) => ({ id: k.id, userId: k.userId, name: k.name })));
      } else {
        // 如果指定了 keyIds，只检测这些 Key
        for (const keyId of request.keyIds) {
          const userKeys = await findKeyList(keyId);
          allKeys.push(...userKeys.map((k) => ({ id: k.id, userId: k.userId, name: k.name })));
        }
      }

      logger.info(`[Consistency] 找到 ${allKeys.length} 个 Key 待检测`);

      // 2. 获取检测维度
      const dimensions: ConsistencyDimension[] = request?.dimensions || [
        "total",
        "daily",
        "weekly",
        "monthly",
        "5h",
      ];

      // 3. 并行检测所有 Key
      const allItems: ConsistencyCheckItem[] = [];
      for (const key of allKeys) {
        const items = await this.checkKey(key.id, key.name, dimensions);
        allItems.push(...items);
      }

      // 4. 应用阈值过滤
      const thresholdUsd = request?.thresholdUsd ?? 0.01;
      const thresholdRate = request?.thresholdRate ?? 5.0;

      const inconsistentItems = allItems.filter(
        (item) => item.difference >= thresholdUsd || item.differenceRate >= thresholdRate
      );

      // 5. 计算统计信息
      const totalDifferenceUsd = inconsistentItems.reduce((sum, item) => sum + item.difference, 0);
      const averageDifferenceRate =
        inconsistentItems.length > 0
          ? inconsistentItems.reduce((sum, item) => sum + item.differenceRate, 0) /
            inconsistentItems.length
          : 0;

      const result: ConsistencyCheckResult = {
        timestamp: new Date(),
        totalKeysChecked: allKeys.length,
        inconsistentCount: inconsistentItems.length,
        totalDifferenceUsd,
        averageDifferenceRate,
        items: inconsistentItems,
      };

      const duration = Date.now() - startTime;
      logger.info(
        `[Consistency] 检测完成，耗时 ${duration}ms，发现 ${inconsistentItems.length} 个不一致项`
      );

      return result;
    } catch (error) {
      logger.error("[Consistency] 检测失败:", error);
      throw error;
    }
  }

  /**
   * 检测单个 Key 的所有维度
   */
  static async checkKey(
    keyId: number,
    keyName: string,
    dimensions: ConsistencyDimension[]
  ): Promise<ConsistencyCheckItem[]> {
    const items: ConsistencyCheckItem[] = [];

    for (const dimension of dimensions) {
      try {
        const item = await this.checkKeyDimension(keyId, keyName, dimension);
        if (item) {
          items.push(item);
        }
      } catch (error) {
        logger.error(`[Consistency] 检测失败 key=${keyId} dimension=${dimension}:`, error);
      }
    }

    return items;
  }

  /**
   * 检测单个 Key 的单个维度
   */
  static async checkKeyDimension(
    keyId: number,
    keyName: string,
    dimension: ConsistencyDimension
  ): Promise<ConsistencyCheckItem | null> {
    try {
      // 1. 从 Redis 获取缓存值
      const redisValue = await this.getRedisValue(keyId, dimension);

      // 2. 从数据库计算真实值
      const databaseValue = await this.getDatabaseValue(keyId, dimension);

      // 3. 计算差异
      const difference = Math.abs(databaseValue - (redisValue ?? 0));
      const differenceRate = databaseValue > 0 ? (difference / databaseValue) * 100 : 0;

      // 4. 判断状态
      let status: ConsistencyCheckItem["status"] = "consistent";
      if (redisValue === null) {
        status = "redis_missing";
      } else if (difference > 0.001) {
        // 差异超过 0.001 美元视为不一致
        status = "inconsistent";
      }

      return {
        keyId,
        keyName,
        dimension,
        redisValue,
        databaseValue,
        difference,
        differenceRate,
        status,
      };
    } catch (error) {
      logger.error(`[Consistency] 检测维度失败 key=${keyId} dimension=${dimension}:`, error);
      return null;
    }
  }

  /**
   * 从 Redis 获取缓存值
   */
  private static async getRedisValue(
    keyId: number,
    dimension: ConsistencyDimension
  ): Promise<number | null> {
    const redis = getRedisClient();
    if (!redis || redis.status !== "ready") {
      return null;
    }

    try {
      let key: string;
      if (dimension === "5h") {
        key = `key:${keyId}:cost_5h_rolling`;
        // 5h 使用 ZSET，需要计算总和
        const now = Date.now();
        const fiveHoursAgo = now - 5 * 60 * 60 * 1000;
        const members = await redis.zrangebyscore(key, fiveHoursAgo, now);
        if (members.length === 0) return null;
        // 计算总和（这里简化处理，实际需要从 member 中解析成本）
        // 由于 ZSET 存储的是复杂数据，这里先返回 member 数量作为占位
        // TODO: 需要解析 ZSET 的实际数据结构
        return members.length > 0 ? 0 : null;
      } else if (dimension === "total") {
        key = `key:${keyId}:total_cost`;
      } else if (dimension === "daily") {
        key = `key:${keyId}:daily_cost`;
      } else if (dimension === "weekly") {
        key = `key:${keyId}:cost_weekly`;
      } else {
        // monthly
        key = `key:${keyId}:cost_monthly`;
      }

      const value = await redis.get(key);
      return value !== null ? parseFloat(value) : null;
    } catch (error) {
      logger.error(`[Consistency] 读取 Redis 失败 key=${keyId} dimension=${dimension}:`, error);
      return null;
    }
  }

  /**
   * 从数据库计算真实值
   */
  private static async getDatabaseValue(
    keyId: number,
    dimension: ConsistencyDimension
  ): Promise<number> {
    try {
      if (dimension === "total") {
        // 总费用：从创建开始至今的所有消费
        const { startTime, endTime } = {
          startTime: new Date(0), // Unix 纪元
          endTime: new Date(),
        };
        return await sumKeyCostInTimeRange(keyId, startTime, endTime);
      } else if (dimension === "daily") {
        // 每日费用：今天 0 点至今
        return await sumKeyCostToday(keyId);
      } else {
        // 周/月/5h：使用时间范围查询
        const { startTime, endTime } = getTimeRangeForPeriod(dimension);
        return await sumKeyCostInTimeRange(keyId, startTime, endTime);
      }
    } catch (error) {
      logger.error(`[Consistency] 查询数据库失败 key=${keyId} dimension=${dimension}:`, error);
      return 0;
    }
  }

  /**
   * 修复单个不一致项
   */
  static async fixItem(keyId: number, dimension: ConsistencyDimension): Promise<void> {
    logger.info(`[Consistency] 开始修复 key=${keyId} dimension=${dimension}`);

    try {
      // 1. 从数据库重新计算正确值
      const correctValue = await this.getDatabaseValue(keyId, dimension);

      // 2. 更新到 Redis
      await this.updateRedisValue(keyId, dimension, correctValue);

      logger.info(
        `[Consistency] 修复完成 key=${keyId} dimension=${dimension} value=${correctValue}`
      );
    } catch (error) {
      logger.error(`[Consistency] 修复失败 key=${keyId} dimension=${dimension}:`, error);
      throw error;
    }
  }

  /**
   * 更新 Redis 缓存值
   */
  private static async updateRedisValue(
    keyId: number,
    dimension: ConsistencyDimension,
    value: number
  ): Promise<void> {
    const redis = getRedisClient();
    if (!redis || redis.status !== "ready") {
      throw new Error("Redis 不可用");
    }

    try {
      let key: string;
      let ttl: number | undefined;

      if (dimension === "total") {
        key = `key:${keyId}:total_cost`;
        // 总费用没有 TTL
      } else if (dimension === "daily") {
        key = `key:${keyId}:daily_cost`;
        // 计算到今天午夜的秒数
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        ttl = Math.floor((midnight.getTime() - now.getTime()) / 1000);
      } else if (dimension === "weekly") {
        key = `key:${keyId}:cost_weekly`;
        // 周：到本周日午夜的秒数
        const now = new Date();
        const sunday = new Date(now);
        sunday.setDate(now.getDate() + (7 - now.getDay()));
        sunday.setHours(24, 0, 0, 0);
        ttl = Math.floor((sunday.getTime() - now.getTime()) / 1000);
      } else if (dimension === "monthly") {
        key = `key:${keyId}:cost_monthly`;
        // 月：到本月最后一天午夜的秒数
        const now = new Date();
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 24, 0, 0);
        ttl = Math.floor((lastDay.getTime() - now.getTime()) / 1000);
      } else {
        // 5h：使用 ZSET，处理较复杂
        key = `key:${keyId}:cost_5h_rolling`;
        // TODO: 需要实现 ZSET 的更新逻辑
        logger.warn(`[Consistency] 暂不支持修复 5h 滚动窗口维度`);
        return;
      }

      if (ttl) {
        await redis.set(key, value.toString(), "EX", ttl);
      } else {
        await redis.set(key, value.toString());
      }

      logger.info(`[Consistency] 已更新 Redis ${key} = ${value}`);
    } catch (error) {
      logger.error(`[Consistency] 更新 Redis 失败 key=${keyId} dimension=${dimension}:`, error);
      throw error;
    }
  }

  /**
   * 批量修复所有不一致项
   */
  static async fixAll(items: ConsistencyCheckItem[]): Promise<number> {
    logger.info(`[Consistency] 开始批量修复 ${items.length} 个不一致项`);
    let fixedCount = 0;

    for (const item of items) {
      try {
        await this.fixItem(item.keyId, item.dimension);
        fixedCount++;
      } catch (error) {
        logger.error(
          `[Consistency] 修复失败 key=${item.keyId} dimension=${item.dimension}:`,
          error
        );
      }
    }

    logger.info(`[Consistency] 批量修复完成，成功 ${fixedCount}/${items.length} 项`);
    return fixedCount;
  }

  /**
   * 全局重建缓存（危险操作）
   */
  static async globalRebuild(): Promise<void> {
    logger.warn("[Consistency] 开始全局重建缓存（危险操作）");
    const redis = getRedisClient();

    if (!redis || redis.status !== "ready") {
      throw new Error("Redis 不可用，无法执行全局重建");
    }

    try {
      // 1. 清空所有 key:*:cost_* 相关的缓存
      const pattern = "key:*:cost_*";
      const keys = await redis.keys(pattern);

      if (keys.length > 0) {
        logger.info(`[Consistency] 找到 ${keys.length} 个缓存键待删除`);
        await redis.del(...keys);
        logger.info(`[Consistency] 已删除 ${keys.length} 个缓存键`);
      } else {
        logger.info("[Consistency] 没有找到需要删除的缓存键");
      }

      logger.warn("[Consistency] 全局重建完成，缓存已清空，下次请求时会自动重建");
    } catch (error) {
      logger.error("[Consistency] 全局重建失败:", error);
      throw error;
    }
  }
}
