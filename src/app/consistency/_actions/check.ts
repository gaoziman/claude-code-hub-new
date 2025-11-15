"use server";

import { ActionResult } from "@/actions/types";
import { ConsistencyService } from "@/lib/consistency/service";
import { createConsistencyHistory } from "@/repository/consistency";
import type {
  ConsistencyCheckResult,
  CheckConsistencyRequest,
} from "@/types/consistency";
import { logger } from "@/lib/logger";

/**
 * 执行数据一致性检测
 */
export async function checkConsistency(
  request?: CheckConsistencyRequest
): Promise<ActionResult<ConsistencyCheckResult>> {
  try {
    logger.info("[Action] 开始数据一致性检测", request);

    // 执行检测
    const result = await ConsistencyService.checkAll(request);

    // 记录到操作历史
    await createConsistencyHistory({
      timestamp: result.timestamp,
      operationType: "manual_check",
      operator: "admin",
      keysChecked: result.totalKeysChecked,
      inconsistenciesFound: result.inconsistentCount,
      itemsFixed: 0,
      totalDifference: result.totalDifferenceUsd.toString(),
      details: result,
    });

    logger.info(
      `[Action] 检测完成，发现 ${result.inconsistentCount} 个不一致项`
    );

    return {
      ok: true,
      data: result,
    };
  } catch (error) {
    logger.error("[Action] 检测失败:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "检测失败",
    };
  }
}

/**
 * 获取最近一次检测结果（用于页面初始化）
 */
export async function getLatestCheckResult(): Promise<
  ActionResult<ConsistencyCheckResult | null>
> {
  try {
    const { findLatestConsistencyHistory } = await import("@/repository/consistency");
    const latest = await findLatestConsistencyHistory();

    if (!latest || latest.operationType !== "manual_check") {
      return {
        ok: true,
        data: null,
      };
    }

    return {
      ok: true,
      data: latest.details,
    };
  } catch (error) {
    logger.error("[Action] 获取最近检测结果失败:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "获取失败",
    };
  }
}
