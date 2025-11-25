"use server";

import { revalidatePath } from "next/cache";
import {
  rechargeBalance,
  adjustBalance,
  getUserBalance,
  getBalanceTransactions,
  getBalanceStats,
} from "@/repository/balance";
import type { BalanceTransaction, BalanceTransactionQueryOptions } from "@/repository/balance";
import { findUserById } from "@/repository/user";
import { getSession } from "@/lib/auth";
import { logger } from "@/lib/logger";

export interface BalanceActionResult<T = void> {
  success: boolean;
  error?: string;
  data?: T;
}

/**
 * 管理员充值操作
 *
 * @param userId - 目标用户ID
 * @param amount - 充值金额（美元）
 * @param note - 备注说明（可选）
 * @returns 充值结果
 */
export async function rechargeUserBalanceAction(
  userId: number,
  amount: number,
  note?: string
): Promise<
  BalanceActionResult<{
    balanceBefore: number;
    balanceAfter: number;
    transactionId: number;
  }>
> {
  try {
    // ========== 权限检查：仅管理员可操作 ==========
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      logger.warn("[BalanceAction] Unauthorized recharge attempt", {
        userId,
        operatorId: session?.user.id,
      });
      return {
        success: false,
        error: "仅管理员可执行充值操作",
      };
    }

    const currentUser = session.user;

    // ========== 参数校验 ==========
    if (amount <= 0) {
      return {
        success: false,
        error: "充值金额必须大于0",
      };
    }

    if (amount > 10000) {
      return {
        success: false,
        error: "单次充值金额不能超过 $10,000",
      };
    }

    // ========== 检查目标用户是否存在 ==========
    const targetUser = await findUserById(userId);
    if (!targetUser) {
      return {
        success: false,
        error: "目标用户不存在",
      };
    }

    // ========== 执行充值 ==========
    const result = await rechargeBalance(userId, amount, currentUser.id, currentUser.name, note);

    logger.info("[BalanceAction] Recharge successful", {
      userId,
      amount,
      operatorId: currentUser.id,
      operatorName: currentUser.name,
      transactionId: result.transactionId,
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
    });

    // 重新验证所有相关页面缓存
    revalidatePath("/dashboard/users");
    revalidatePath("/dashboard/clients");
    revalidatePath("/dashboard/keys");
    revalidatePath("/dashboard", "layout"); // 刷新整个 dashboard 布局

    return {
      success: true,
      data: {
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
        transactionId: result.transactionId,
      },
    };
  } catch (error) {
    logger.error("[BalanceAction] Recharge failed", {
      userId,
      amount,
      error,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "充值失败，请稍后重试",
    };
  }
}

/**
 * 管理员调整余额操作
 *
 * @param userId - 目标用户ID
 * @param adjustAmount - 调整金额（美元，正数=增加，负数=减少）
 * @param note - 调整原因说明（必填）
 * @returns 调整结果
 */
export async function adjustUserBalanceAction(
  userId: number,
  adjustAmount: number,
  note: string
): Promise<
  BalanceActionResult<{
    balanceBefore: number;
    balanceAfter: number;
    transactionId: number;
  }>
> {
  try {
    // ========== 权限检查：仅管理员可操作 ==========
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      logger.warn("[BalanceAction] Unauthorized adjustment attempt", {
        userId,
        operatorId: session?.user.id,
      });
      return {
        success: false,
        error: "仅管理员可执行余额调整操作",
      };
    }

    const currentUser = session.user;

    // ========== 参数校验 ==========
    if (adjustAmount === 0) {
      return {
        success: false,
        error: "调整金额不能为 0",
      };
    }

    // 减少余额时必须填写备注
    if (adjustAmount < 0 && (!note || note.trim() === "")) {
      return {
        success: false,
        error: "减少余额时必须填写备注说明",
      };
    }

    if (Math.abs(adjustAmount) > 10000) {
      return {
        success: false,
        error: "单次调整金额不能超过 $10,000",
      };
    }

    // ========== 检查目标用户是否存在 ==========
    const targetUser = await findUserById(userId);
    if (!targetUser) {
      return {
        success: false,
        error: "目标用户不存在",
      };
    }

    // ========== 执行调整 ==========
    const result = await adjustBalance(
      userId,
      adjustAmount,
      currentUser.id,
      currentUser.name,
      note ? note.trim() : ""
    );

    logger.info("[BalanceAction] Adjustment successful", {
      userId,
      adjustAmount,
      operatorId: currentUser.id,
      operatorName: currentUser.name,
      transactionId: result.transactionId,
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
      note: note.trim(),
    });

    // 重新验证所有相关页面缓存
    revalidatePath("/dashboard/users");
    revalidatePath("/dashboard/clients");
    revalidatePath("/dashboard/keys");
    revalidatePath("/dashboard", "layout");

    return {
      success: true,
      data: {
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
        transactionId: result.transactionId,
      },
    };
  } catch (error) {
    logger.error("[BalanceAction] Adjustment failed", {
      userId,
      adjustAmount,
      note,
      error,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "调整余额失败，请稍后重试",
    };
  }
}

/**
 * 查询用户余额
 *
 * @param userId - 用户ID
 * @returns 用户余额
 */
export async function getUserBalanceAction(userId: number): Promise<BalanceActionResult<number>> {
  try {
    // ========== 权限检查：仅管理员可查询他人余额 ==========
    const session = await getSession();
    if (!session) {
      return {
        success: false,
        error: "未登录",
      };
    }

    const currentUser = session.user;
    if (currentUser.role !== "admin" && currentUser.id !== userId) {
      logger.warn("[BalanceAction] Unauthorized balance query attempt", {
        userId,
        operatorId: currentUser.id,
      });
      return {
        success: false,
        error: "无权查询该用户余额",
      };
    }

    // ========== 查询余额 ==========
    const balance = await getUserBalance(userId);
    if (balance === null) {
      return {
        success: false,
        error: "用户不存在",
      };
    }

    return {
      success: true,
      data: balance,
    };
  } catch (error) {
    logger.error("[BalanceAction] Get balance failed", {
      userId,
      error,
    });

    return {
      success: false,
      error: "查询余额失败",
    };
  }
}

/**
 * 查询余额交易历史
 *
 * @param options - 查询选项
 * @returns 交易历史记录
 */
export async function getBalanceTransactionsAction(
  options: BalanceTransactionQueryOptions
): Promise<BalanceActionResult<BalanceTransaction[]>> {
  try {
    // ========== 权限检查：仅管理员可查询他人交易记录 ==========
    const session = await getSession();
    if (!session) {
      return {
        success: false,
        error: "未登录",
      };
    }

    const currentUser = session.user;
    if (currentUser.role !== "admin" && options.userId && currentUser.id !== options.userId) {
      logger.warn("[BalanceAction] Unauthorized transaction query attempt", {
        queryUserId: options.userId,
        operatorId: currentUser.id,
      });
      return {
        success: false,
        error: "无权查询该用户的交易记录",
      };
    }

    // ========== 查询交易记录 ==========
    const transactions = await getBalanceTransactions(options);

    return {
      success: true,
      data: transactions,
    };
  } catch (error) {
    logger.error("[BalanceAction] Get transactions failed", {
      options,
      error,
    });

    return {
      success: false,
      error: "查询交易记录失败",
    };
  }
}

/**
 * 获取余额统计
 *
 * @param userId - 用户ID
 * @returns 余额统计信息
 */
export async function getBalanceStatsAction(userId: number): Promise<
  BalanceActionResult<{
    totalRecharge: number;
    totalDeduction: number;
    currentBalance: number;
  }>
> {
  try {
    // ========== 权限检查：仅管理员可查询他人统计 ==========
    const session = await getSession();
    if (!session) {
      return {
        success: false,
        error: "未登录",
      };
    }

    const currentUser = session.user;
    if (currentUser.role !== "admin" && currentUser.id !== userId) {
      logger.warn("[BalanceAction] Unauthorized stats query attempt", {
        userId,
        operatorId: currentUser.id,
      });
      return {
        success: false,
        error: "无权查询该用户的统计信息",
      };
    }

    // ========== 查询统计 ==========
    const stats = await getBalanceStats(userId);
    if (!stats) {
      return {
        success: false,
        error: "用户不存在",
      };
    }

    return {
      success: true,
      data: stats,
    };
  } catch (error) {
    logger.error("[BalanceAction] Get stats failed", {
      userId,
      error,
    });

    return {
      success: false,
      error: "查询统计信息失败",
    };
  }
}
