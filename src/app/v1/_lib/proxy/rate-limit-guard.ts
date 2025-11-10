import type { ProxySession } from "./session";
import { RateLimitService } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export class ProxyRateLimitGuard {
  /**
   * 检查限流（用户层 + Key 层）
   */
  static async ensure(session: ProxySession): Promise<Response | null> {
    const user = session.authState?.user;
    const key = session.authState?.key;

    if (!user || !key) return null;

    // ========== Key 层限流检查 ==========

    // 1. 检查 Key RPM 限制
    const rpmCheck = await RateLimitService.checkKeyRPM(key.id, key.rpmLimit);
    if (!rpmCheck.allowed) {
      logger.warn(`[RateLimit] Key RPM exceeded: key=${key.id}, ${rpmCheck.reason}`);
      return this.buildRateLimitResponse(key.id, "key", rpmCheck.reason!);
    }

    // 2. 检查 Key 每日额度
    const dailyCheck = await RateLimitService.checkKeyDailyCost(key.id, key.dailyLimitUsd);
    if (!dailyCheck.allowed) {
      logger.warn(`[RateLimit] Key daily limit exceeded: key=${key.id}, ${dailyCheck.reason}`);
      return this.buildRateLimitResponse(key.id, "key", dailyCheck.reason!);
    }

    // 3. 检查 Key 金额限制
    const costCheck = await RateLimitService.checkCostLimits(key.id, "key", {
      limit_5h_usd: key.limit5hUsd,
      limit_weekly_usd: key.limitWeeklyUsd,
      limit_monthly_usd: key.limitMonthlyUsd,
      total_limit_usd: key.totalLimitUsd,
    });

    if (!costCheck.allowed) {
      logger.warn(`[RateLimit] Key cost limit exceeded: key=${key.id}, ${costCheck.reason}`);
      return this.buildRateLimitResponse(key.id, "key", costCheck.reason!);
    }

    // 4. 检查 Key 并发 Session 限制
    const sessionCheck = await RateLimitService.checkSessionLimit(
      key.id,
      "key",
      key.limitConcurrentSessions || 0
    );

    if (!sessionCheck.allowed) {
      logger.warn(`[RateLimit] Key session limit exceeded: key=${key.id}, ${sessionCheck.reason}`);
      return this.buildRateLimitResponse(key.id, "key", sessionCheck.reason!);
    }

    return null; // ✅ 通过所有检查
  }

  /**
   * 构建 429 响应
   */
  private static buildRateLimitResponse(
    id: number,
    type: "user" | "key" | "provider",
    reason: string
  ): Response {
    const message = type === "user" ? `用户限流：${reason}` : `Key 限流：${reason}`;

    const headers = new Headers({
      "Content-Type": "application/json",
      "X-RateLimit-Type": type,
      "Retry-After": "3600", // 1 小时后重试
    });

    return new Response(
      JSON.stringify({
        error: {
          type: "rate_limit_error",
          message,
        },
      }),
      {
        status: 429,
        headers,
      }
    );
  }
}
