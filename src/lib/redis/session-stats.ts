import { SessionTracker } from "@/lib/session-tracker";
import { logger } from "@/lib/logger";

/**
 * 获取当前活跃的并发 session 数量（全局）
 *
 * 使用 SessionTracker 的统一计数逻辑：
 * 1. 自动兼容新旧格式（ZSET/Set）
 * 2. ZREMRANGEBYSCORE 清理过期 session（5 分钟前）
 * 3. 批量 EXISTS 验证 session:${sessionId}:info 是否存在
 * 4. 返回真实有效的 session 数量
 *
 * @returns 当前并发 session 数量（Redis 不可用时返回 0）
 */
export async function getActiveConcurrentSessions(): Promise<number> {
  try {
    return await SessionTracker.getGlobalSessionCount();
  } catch (error) {
    logger.error("[SessionStats] Failed to get concurrent sessions:", error);
    return 0; // Fail Open
  }
}

/**
 * 获取当前活跃的并发 session 数量（用户级别）
 *
 * 实现策略：
 * 1. 查询用户的所有 API Keys
 * 2. 对每个 Key 调用 SessionTracker.getKeySessionCount()
 * 3. 汇总所有 Key 的并发数
 *
 * @param userId - 用户 ID
 * @returns 用户当前并发 session 数量（Redis 或数据库不可用时返回 0）
 */
export async function getActiveConcurrentSessionsByUser(userId: number): Promise<number> {
  try {
    // 动态导入以避免循环依赖
    const { findKeyList } = await import("@/repository/key");

    // 1. 查询用户的所有 keys
    const userKeys = await findKeyList(userId);

    if (userKeys.length === 0) {
      return 0;
    }

    // 2. 对每个 key 查询并发 session 数
    const counts = await Promise.all(
      userKeys.map((key) => SessionTracker.getKeySessionCount(key.id))
    );

    // 3. 汇总
    const totalCount = counts.reduce((sum, count) => sum + count, 0);

    logger.trace("[SessionStats] User concurrent sessions", {
      userId,
      keysCount: userKeys.length,
      totalCount,
    });

    return totalCount;
  } catch (error) {
    logger.error("[SessionStats] Failed to get user concurrent sessions:", error);
    return 0; // Fail Open
  }
}

export async function getActiveConcurrentSessionsByKey(keyId: number): Promise<number> {
  try {
    return await SessionTracker.getKeySessionCount(keyId);
  } catch (error) {
    logger.error("[SessionStats] Failed to get key concurrent sessions:", { error, keyId });
    return 0;
  }
}
