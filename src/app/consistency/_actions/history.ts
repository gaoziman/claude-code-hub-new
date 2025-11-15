"use server";

import { ActionResult } from "@/actions/types";
import {
  findConsistencyHistory,
  findConsistencyHistoryById,
  getConsistencyStatistics,
} from "@/repository/consistency";
import type {
  ConsistencyHistoryQuery,
  ConsistencyHistoryResponse,
  ConsistencyHistory,
} from "@/types/consistency";
import { logger } from "@/lib/logger";

/**
 * 查询操作历史（分页）
 */
export async function getConsistencyHistory(
  query: ConsistencyHistoryQuery
): Promise<ActionResult<ConsistencyHistoryResponse>> {
  try {
    const result = await findConsistencyHistory(query);

    return {
      ok: true,
      data: result,
    };
  } catch (error) {
    logger.error("[Action] 查询操作历史失败:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "查询失败",
    };
  }
}

/**
 * 获取操作历史详情
 */
export async function getConsistencyHistoryDetail(
  id: number
): Promise<ActionResult<ConsistencyHistory | null>> {
  try {
    const record = await findConsistencyHistoryById(id);

    return {
      ok: true,
      data: record,
    };
  } catch (error) {
    logger.error("[Action] 获取操作历史详情失败:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "获取失败",
    };
  }
}

/**
 * 获取操作统计信息
 */
export async function getStatistics(days: number = 7): Promise<
  ActionResult<{
    totalChecks: number;
    totalInconsistencies: number;
    totalFixed: number;
    fixRate: number;
  }>
> {
  try {
    const stats = await getConsistencyStatistics(days);

    return {
      ok: true,
      data: stats,
    };
  } catch (error) {
    logger.error("[Action] 获取统计信息失败:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "获取失败",
    };
  }
}
