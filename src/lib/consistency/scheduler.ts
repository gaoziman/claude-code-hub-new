import { logger } from "@/lib/logger";
import type { TaskStatus } from "@/types/consistency";

// 定时任务状态
let schedulerInterval: NodeJS.Timeout | null = null;
let nextRunTime: Date | null = null;
let lastRunTime: Date | null = null;
let lastRunResult: {
  keysChecked: number;
  inconsistenciesFound: number;
  itemsFixed: number;
} | null = null;
let isRunning = false;

/**
 * 启动定时任务调度器
 */
export async function startScheduler(): Promise<void> {
  try {
    logger.info("[Scheduler] 启动定时任务调度器");

    // 停止现有任务
    stopScheduler();

    // 获取配置
    const { getTaskConfig } = await import("@/repository/consistency");
    const config = await getTaskConfig();

    if (!config.enabled) {
      logger.info("[Scheduler] 定时任务已禁用，不启动");
      return;
    }

    // 计算间隔（转换为毫秒）
    const intervalMs = config.intervalHours * 60 * 60 * 1000;

    // 设置定时器
    schedulerInterval = setInterval(async () => {
      await runScheduledTask();
    }, intervalMs);

    // 计算下次运行时间
    nextRunTime = new Date(Date.now() + intervalMs);

    logger.info(
      `[Scheduler] 定时任务已启动，间隔 ${config.intervalHours} 小时，下次运行: ${nextRunTime.toISOString()}`
    );
  } catch (error) {
    logger.error("[Scheduler] 启动定时任务失败:", error);
    throw error;
  }
}

/**
 * 停止定时任务调度器
 */
export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    nextRunTime = null;
    logger.info("[Scheduler] 定时任务已停止");
  }
}

/**
 * 重启定时任务调度器
 */
export async function restartScheduler(): Promise<void> {
  logger.info("[Scheduler] 重启定时任务调度器");
  stopScheduler();
  await startScheduler();
}

/**
 * 执行一次定时任务
 */
export async function runScheduledTask(): Promise<void> {
  if (isRunning) {
    logger.warn("[Scheduler] 上一次任务还在运行中，跳过本次执行");
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    logger.info("[Scheduler] 开始执行定时任务");

    // 获取配置
    const { getTaskConfig } = await import("@/repository/consistency");
    const config = await getTaskConfig();

    // 执行检测
    const { ConsistencyService } = await import("./service");
    const result = await ConsistencyService.checkAll({
      thresholdUsd: config.thresholdUsd,
      thresholdRate: config.thresholdRate,
    });

    // 记录操作历史
    const { createConsistencyHistory } = await import("@/repository/consistency");
    await createConsistencyHistory({
      timestamp: result.timestamp,
      operationType: "scheduled_check",
      operator: "system",
      keysChecked: result.totalKeysChecked,
      inconsistenciesFound: result.inconsistentCount,
      itemsFixed: 0,
      totalDifference: result.totalDifferenceUsd.toString(),
      details: result,
    });

    // 如果启用了自动修复且发现不一致
    if (config.autoFix && result.inconsistentCount > 0) {
      logger.info(`[Scheduler] 发现 ${result.inconsistentCount} 个不一致项，开始自动修复`);

      const fixedCount = await ConsistencyService.fixAll(result.items);

      // 记录修复历史
      await createConsistencyHistory({
        timestamp: new Date(),
        operationType: "auto_fix",
        operator: "system",
        keysChecked: result.inconsistentCount,
        inconsistenciesFound: result.inconsistentCount,
        itemsFixed: fixedCount,
        totalDifference: result.totalDifferenceUsd.toString(),
        details: null,
      });

      lastRunResult = {
        keysChecked: result.totalKeysChecked,
        inconsistenciesFound: result.inconsistentCount,
        itemsFixed: fixedCount,
      };
    } else {
      lastRunResult = {
        keysChecked: result.totalKeysChecked,
        inconsistenciesFound: result.inconsistentCount,
        itemsFixed: 0,
      };
    }

    lastRunTime = new Date();

    // 更新下次运行时间
    if (schedulerInterval) {
      const intervalMs = config.intervalHours * 60 * 60 * 1000;
      nextRunTime = new Date(Date.now() + intervalMs);
    }

    const duration = Date.now() - startTime;
    const resultStr = `检测 ${lastRunResult.keysChecked} 个 Key，发现 ${lastRunResult.inconsistenciesFound} 个不一致${lastRunResult.itemsFixed > 0 ? `，已自动修复 ${lastRunResult.itemsFixed} 个` : ""}`;
    logger.info(`[Scheduler] 定时任务完成，耗时 ${duration}ms，结果: ${resultStr}`);
  } catch (error) {
    logger.error("[Scheduler] 定时任务执行失败:", error);
    lastRunResult = null;
    lastRunTime = new Date();
  } finally {
    isRunning = false;
  }
}

/**
 * 获取调度器状态
 */
export async function getSchedulerStatus(): Promise<TaskStatus> {
  // 获取配置
  const { getTaskConfig } = await import("@/repository/consistency");
  const config = await getTaskConfig();

  return {
    enabled: config.enabled,
    intervalHours: config.intervalHours,
    isRunning: isRunning || schedulerInterval !== null,
    lastRun: lastRunTime,
    nextRun: nextRunTime,
    lastRunResult,
  };
}

/**
 * 应用启动时初始化调度器
 */
export async function initializeScheduler(): Promise<void> {
  try {
    // 只在生产环境自动启动
    if (process.env.NODE_ENV === "production") {
      await startScheduler();
    } else {
      logger.info("[Scheduler] 非生产环境，不自动启动定时任务");
    }
  } catch (error) {
    logger.error("[Scheduler] 初始化调度器失败:", error);
  }
}
