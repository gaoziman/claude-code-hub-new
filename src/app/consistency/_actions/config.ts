"use server";

import { ActionResult } from "@/actions/types";
import {
  getTaskConfig as getTaskConfigFromDb,
  updateTaskConfig as updateTaskConfigInDb,
} from "@/repository/consistency";
import type {
  ConsistencyTaskConfig,
  UpdateTaskConfigRequest,
  TaskStatus,
} from "@/types/consistency";
import { logger } from "@/lib/logger";

/**
 * 获取任务配置
 */
export async function getTaskConfig(): Promise<ActionResult<ConsistencyTaskConfig>> {
  try {
    const config = await getTaskConfigFromDb();

    return {
      ok: true,
      data: config,
    };
  } catch (error) {
    logger.error("[Action] 获取任务配置失败:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "获取失败",
    };
  }
}

/**
 * 更新任务配置
 */
export async function updateTaskConfig(
  updates: UpdateTaskConfigRequest
): Promise<ActionResult<ConsistencyTaskConfig>> {
  try {
    logger.info("[Action] 更新任务配置", updates);

    const config = await updateTaskConfigInDb(updates);

    // 如果启用状态或间隔发生变化，重启定时任务
    if (updates.enabled !== undefined || updates.intervalHours !== undefined) {
      try {
        const { restartScheduler } = await import("@/lib/consistency/scheduler");
        await restartScheduler();
        logger.info("[Action] 定时任务已重启");
      } catch (error) {
        logger.error("[Action] 重启定时任务失败:", error);
      }
    }

    logger.info("[Action] 任务配置更新成功");

    return {
      ok: true,
      data: config,
    };
  } catch (error) {
    logger.error("[Action] 更新任务配置失败:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "更新失败",
    };
  }
}

/**
 * 获取任务运行状态
 */
export async function getTaskStatus(): Promise<ActionResult<TaskStatus>> {
  try {
    const { getSchedulerStatus } = await import("@/lib/consistency/scheduler");
    const status = await getSchedulerStatus();

    return {
      ok: true,
      data: status,
    };
  } catch (error) {
    logger.error("[Action] 获取任务状态失败:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "获取失败",
    };
  }
}

/**
 * 手动触发一次定时任务
 */
export async function triggerScheduledTask(): Promise<ActionResult<void>> {
  try {
    logger.info("[Action] 手动触发定时任务");

    const { runScheduledTask } = await import("@/lib/consistency/scheduler");
    await runScheduledTask();

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    logger.error("[Action] 触发任务失败:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "触发失败",
    };
  }
}
