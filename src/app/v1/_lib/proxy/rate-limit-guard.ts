import type { ProxySession } from "./session";
import { RateLimitService } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { ProxyResponses } from "./responses";

export class ProxyRateLimitGuard {
  /**
   * 检查限流（两层级联：用户层 → Key 独立层）
   */
  static async ensure(session: ProxySession): Promise<Response | null> {
    const user = session.authState?.user;
    const key = session.authState?.key;

    if (!user || !key) return null;

    // ========== 第一层：用户级别限流检查（双轨：套餐 + 余额） ==========
    logger.info(`[RateLimit] Layer 1: Checking user-level limits (dual-track) for user=${user.id}`);

    // 查询用户配置（包含限额和余额字段）
    const { findUserById } = await import("@/repository/user");
    const userConfig = await findUserById(user.id);

    if (userConfig) {
      // 保守估算成本：$0.10（实际扣款在 response-handler 中根据真实 token 消耗进行）
      const estimatedCost = 0.1;

      logger.info(
        `[RateLimit] User balance=${userConfig.balanceUsd}, estimatedCost=${estimatedCost}`
      );

      // 调用双轨检查方法（套餐 + 余额）
      const userCostCheck = await RateLimitService.checkUserCostWithBalance(
        user.id,
        {
          limit_5h_usd: userConfig.limit5hUsd,
          limit_weekly_usd: userConfig.limitWeeklyUsd,
          limit_monthly_usd: userConfig.limitMonthlyUsd,
          total_limit_usd: userConfig.totalLimitUsd,
        },
        userConfig.balanceUsd,
        estimatedCost
      );

      if (!userCostCheck.allowed) {
        logger.warn(
          `[RateLimit] User cost/balance limit exceeded: user=${user.id}, ${userCostCheck.reason}`
        );
        return this.buildRateLimitResponse(user.id, "user", userCostCheck.reason!);
      }

      // 存储支付策略到 session，供 response-handler 使用
      if (userCostCheck.paymentStrategy) {
        session.paymentStrategy = userCostCheck.paymentStrategy;
        logger.info(
          `[RateLimit] Payment strategy: source=${userCostCheck.paymentStrategy.source}, ` +
            `fromPackage=${userCostCheck.paymentStrategy.fromPackage.toFixed(4)}, ` +
            `fromBalance=${userCostCheck.paymentStrategy.fromBalance.toFixed(4)}`
        );
      }
    }

    // ========== 第二层：当前 Key 独立限流检查 ==========
    logger.info(`[RateLimit] Layer 2: Checking individual key limits for key=${key.id}`);

    // 1. 检查 Key RPM 限制
    const rpmCheck = await RateLimitService.checkKeyRPM(key.id, key.rpmLimit);
    if (!rpmCheck.allowed) {
      logger.warn(`[RateLimit] Key RPM exceeded: key=${key.id}, ${rpmCheck.reason}`);
      return this.buildRateLimitResponse(key.id, "key", rpmCheck.reason!);
    }

    // 2. 检查 Key 每日额度
    logger.info(
      `[RateLimit] Checking daily cost for key=${key.id}, dailyLimitUsd=${key.dailyLimitUsd}, type=${typeof key.dailyLimitUsd}`
    );
    const dailyCheck = await RateLimitService.checkKeyDailyCost(key.id, key.dailyLimitUsd);
    logger.info(
      `[RateLimit] Daily check result: allowed=${dailyCheck.allowed}, reason=${dailyCheck.reason}, current=${dailyCheck.current}`
    );
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

    logger.info(`[RateLimit] ✅ All two layers passed for key=${key.id}`);
    return null; // ✅ 通过所有两层检查
  }

  /**
   * 构建 429 限流响应
   */
  private static buildRateLimitResponse(
    id: number,
    type: "user" | "key" | "provider",
    reason: string
  ): Response {
    const message = type === "user" ? `用户限流：${reason}` : `Key 限流：${reason}`;

    // 使用统一的错误响应构建器，符合 Anthropic API 规范
    return ProxyResponses.buildError(429, message, "rate_limit_error");
  }
}
