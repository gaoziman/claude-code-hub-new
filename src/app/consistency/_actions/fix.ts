"use server";

import { ActionResult } from "@/actions/types";
import { ConsistencyService } from "@/lib/consistency/service";
import { createConsistencyHistory } from "@/repository/consistency";
import type { FixInconsistencyRequest, ConsistencyCheckItem } from "@/types/consistency";
import { logger } from "@/lib/logger";

/**
 * 修复单个不一致项
 */
export async function fixInconsistency(
  request: FixInconsistencyRequest
): Promise<ActionResult<void>> {
  try {
    logger.info("[Action] 开始修复单个不一致项", request);

    // 执行修复
    await ConsistencyService.fixItem(request.keyId, request.dimension);

    // 记录到操作历史
    await createConsistencyHistory({
      timestamp: new Date(),
      operationType: "manual_fix",
      operator: "admin",
      keysChecked: 1,
      inconsistenciesFound: 1,
      itemsFixed: 1,
      totalDifference: "0", // 单项修复不记录差异
      details: null,
    });

    logger.info("[Action] 修复完成", request);

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    logger.error("[Action] 修复失败:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "修复失败",
    };
  }
}

/**
 * 批量修复所有不一致项
 */
export async function fixAllInconsistencies(
  items: ConsistencyCheckItem[]
): Promise<ActionResult<{ fixed: number }>> {
  try {
    logger.info(`[Action] 开始批量修复 ${items.length} 个不一致项`);

    if (items.length === 0) {
      return {
        ok: true,
        data: { fixed: 0 },
      };
    }

    // 执行批量修复
    const fixedCount = await ConsistencyService.fixAll(items);

    // 计算总差异
    const totalDifference = items.reduce((sum, item) => sum + item.difference, 0);

    // 记录到操作历史
    await createConsistencyHistory({
      timestamp: new Date(),
      operationType: "manual_fix",
      operator: "admin",
      keysChecked: items.length,
      inconsistenciesFound: items.length,
      itemsFixed: fixedCount,
      totalDifference: totalDifference.toString(),
      details: null,
    });

    logger.info(`[Action] 批量修复完成，成功 ${fixedCount}/${items.length} 项`);

    return {
      ok: true,
      data: { fixed: fixedCount },
    };
  } catch (error) {
    logger.error("[Action] 批量修复失败:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "批量修复失败",
    };
  }
}

/**
 * 全局重建缓存（危险操作）
 */
export async function globalRebuildCache(): Promise<ActionResult<void>> {
  try {
    logger.warn("[Action] 开始全局重建缓存（危险操作）");

    // 执行全局重建
    await ConsistencyService.globalRebuild();

    // 记录到操作历史
    await createConsistencyHistory({
      timestamp: new Date(),
      operationType: "global_rebuild",
      operator: "admin",
      keysChecked: 0,
      inconsistenciesFound: 0,
      itemsFixed: 0,
      totalDifference: "0",
      details: null,
    });

    logger.warn("[Action] 全局重建完成");

    return {
      ok: true,
      data: undefined,
    };
  } catch (error) {
    logger.error("[Action] 全局重建失败:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "全局重建失败",
    };
  }
}
