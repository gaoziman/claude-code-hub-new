import { logger } from "@/lib/logger";
import { db } from "@/drizzle/db";
import { keys, messageRequest } from "@/drizzle/schema";
import { eq, sql, gte, and } from "drizzle-orm";
import { CostAlertData } from "@/lib/wechat/message-templates";

/**
 * 生成成本预警数据
 * @param threshold 阈值 (0-1，例如 0.8 表示 80%)
 * @returns 成本预警数据数组（超过阈值的项）
 */
export async function generateCostAlerts(threshold: number): Promise<CostAlertData[]> {
  try {
    logger.info({
      action: "generate_cost_alerts",
      threshold,
    });

    const alerts: CostAlertData[] = [];

    // 检查 Key 级别的配额超额
    const keyAlerts = await checkKeyQuotas(threshold);
    alerts.push(...keyAlerts);

    logger.info({
      action: "cost_alerts_generated",
      count: alerts.length,
    });

    return alerts;
  } catch (error) {
    logger.error({
      action: "generate_cost_alerts_error",
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * 检查 Key 配额超额情况
 */
async function checkKeyQuotas(threshold: number): Promise<CostAlertData[]> {
  const alerts: CostAlertData[] = [];

  try {
    // 查询有配额限制的密钥
    const keysWithLimits = await db
      .select({
        id: keys.id,
        key: keys.key,
        keyName: keys.name,

        // 限额配置
        limit5h: keys.limit5hUsd,
        limitWeek: keys.limitWeeklyUsd,
        limitMonth: keys.limitMonthlyUsd,
        limitDay: keys.dailyLimitUsd,
      })
      .from(keys)
      .where(
        sql`${keys.limit5hUsd} > 0 OR ${keys.limitWeeklyUsd} > 0 OR ${keys.limitMonthlyUsd} > 0 OR ${keys.dailyLimitUsd} > 0`
      );

    for (const keyData of keysWithLimits) {
      // 获取当前时间点
      const now = new Date();
      const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // 检查每日额度
      if (keyData.limitDay) {
        const limitDay = parseFloat(keyData.limitDay);
        if (limitDay > 0) {
          const costDay = await getKeyCostSince(keyData.key, dayStart);
          if (costDay >= limitDay * threshold) {
            alerts.push({
              targetType: "key",
              targetName: keyData.keyName,
              targetId: keyData.id,
              currentCost: costDay,
              quotaLimit: limitDay,
              threshold,
              period: "今日",
            });
          }
        }
      }

      // 检查 5 小时额度
      if (keyData.limit5h) {
        const limit5h = parseFloat(keyData.limit5h);
        if (limit5h > 0) {
          const cost5h = await getKeyCostSince(keyData.key, fiveHoursAgo);
          if (cost5h >= limit5h * threshold) {
            alerts.push({
              targetType: "key",
              targetName: keyData.keyName,
              targetId: keyData.id,
              currentCost: cost5h,
              quotaLimit: limit5h,
              threshold,
              period: "5小时",
            });
          }
        }
      }

      // 检查本周额度
      if (keyData.limitWeek) {
        const limitWeek = parseFloat(keyData.limitWeek);
        if (limitWeek > 0) {
          const costWeek = await getKeyCostSince(keyData.key, weekStart);
          if (costWeek >= limitWeek * threshold) {
            alerts.push({
              targetType: "key",
              targetName: keyData.keyName,
              targetId: keyData.id,
              currentCost: costWeek,
              quotaLimit: limitWeek,
              threshold,
              period: "本周",
            });
          }
        }
      }

      // 检查本月额度
      if (keyData.limitMonth) {
        const limitMonth = parseFloat(keyData.limitMonth);
        if (limitMonth > 0) {
          const costMonth = await getKeyCostSince(keyData.key, monthStart);
          if (costMonth >= limitMonth * threshold) {
            alerts.push({
              targetType: "key",
              targetName: keyData.keyName,
              targetId: keyData.id,
              currentCost: costMonth,
              quotaLimit: limitMonth,
              threshold,
              period: "本月",
            });
          }
        }
      }
    }
  } catch (error) {
    logger.error({
      action: "check_key_quotas_error",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return alerts;
}

/**
 * 获取密钥在指定时间后的总消费
 */
async function getKeyCostSince(key: string, since: Date): Promise<number> {
  const result = await db
    .select({
      totalCost: sql<number>`COALESCE(SUM(${messageRequest.costUsd}), 0)::numeric`,
    })
    .from(messageRequest)
    .where(and(eq(messageRequest.key, key), gte(messageRequest.createdAt, since)));

  return result[0]?.totalCost || 0;
}
