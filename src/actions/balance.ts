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
 * 管理员和代理用户充值操作
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
    // ========== 权限检查：管理员和代理用户可操作 ==========
    const session = await getSession();
    if (!session) {
      return {
        success: false,
        error: "未登录",
      };
    }

    const currentUser = session.user;
    const currentUserRole = currentUser.role;

    // 普通用户不能充值
    if (currentUserRole === "user") {
      return {
        success: false,
        error: "普通用户无权充值",
      };
    }

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

    // ========== 代理用户权限检查 ==========
    if (currentUserRole === "reseller") {
      // 代理用户只能给子用户充值（不能给自己充值）
      if (targetUser.parentUserId !== currentUser.id) {
        logger.warn("[BalanceAction] Unauthorized recharge attempt by reseller", {
          userId,
          operatorId: currentUser.id,
          targetParentId: targetUser.parentUserId,
        });
        return {
          success: false,
          error: "代理用户只能给自己创建的子用户充值",
        };
      }

      // ========== 代理用户限额校验：充值金额不能超过总可用额度 ==========
      // 总可用额度 = (套餐限额 - 已使用) + 余额
      const { getCurrentUserWithUsage } = await import("@/actions/users");
      const resellerUserWithUsage = await getCurrentUserWithUsage("today");

      if (resellerUserWithUsage) {
        // 计算代理用户的总可用额度
        // 使用最严格的限额维度进行校验（总限额）
        let availableQuota: number | null = null;

        if (resellerUserWithUsage.totalLimitUsd != null) {
          // 有总限额：套餐剩余 + 余额
          availableQuota =
            Math.max(
              0,
              resellerUserWithUsage.totalLimitUsd -
                (resellerUserWithUsage.userAggregateTotalUsage ?? 0)
            ) + (resellerUserWithUsage.balanceUsd ?? 0);
        } else {
          // 无总限额：仅余额
          availableQuota = resellerUserWithUsage.balanceUsd ?? 0;
        }

        // 校验充值金额
        if (availableQuota != null && amount > availableQuota) {
          logger.warn("[BalanceAction] Recharge amount exceeds reseller's available quota", {
            userId,
            amount,
            operatorId: currentUser.id,
            availableQuota,
            totalLimit: resellerUserWithUsage.totalLimitUsd,
            totalUsage: resellerUserWithUsage.userAggregateTotalUsage,
            balance: resellerUserWithUsage.balanceUsd,
          });

          return {
            success: false,
            error: `充值金额 $${amount.toFixed(2)} 超过了您的总可用额度 $${availableQuota.toFixed(2)}（套餐剩余 + 余额）`,
          };
        }

        logger.info("[BalanceAction] Reseller quota check passed", {
          userId,
          amount,
          operatorId: currentUser.id,
          availableQuota,
        });
      }
    }

    // ========== 执行充值 ==========
    const result = await rechargeBalance(userId, amount, currentUser.id, currentUser.name, note);

    logger.info("[BalanceAction] Recharge successful", {
      userId,
      amount,
      operatorId: currentUser.id,
      operatorName: currentUser.name,
      operatorRole: currentUserRole,
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
    // ========== 权限检查：管理员和代理用户可操作 ==========
    const session = await getSession();
    if (!session) {
      return {
        success: false,
        error: "未登录",
      };
    }

    const currentUser = session.user;
    const currentUserRole = currentUser.role;

    // 普通用户不能调整余额
    if (currentUserRole === "user") {
      return {
        success: false,
        error: "普通用户无权调整余额",
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

    // ========== 代理用户权限检查 ==========
    if (currentUserRole === "reseller") {
      // 代理用户只能管理自己和子用户的余额
      if (targetUser.id !== currentUser.id && targetUser.parentUserId !== currentUser.id) {
        logger.warn("[BalanceAction] Unauthorized adjustment attempt by reseller", {
          userId,
          operatorId: currentUser.id,
          targetParentId: targetUser.parentUserId,
        });
        return {
          success: false,
          error: "代理用户只能调整自己和自己创建的用户余额",
        };
      }
    }

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

    // ========== 代理用户限额校验（仅增加余额时校验）==========
    if (currentUserRole === "reseller" && adjustAmount > 0) {
      // 只在给子用户增加余额时校验（调整自己的余额不校验）
      if (targetUser.id !== currentUser.id) {
        // 总可用额度 = (套餐限额 - 已使用) + 余额
        const { getCurrentUserWithUsage } = await import("@/actions/users");
        const resellerUserWithUsage = await getCurrentUserWithUsage("today");

        if (resellerUserWithUsage) {
          // 计算代理用户的总可用额度
          let availableQuota: number | null = null;

          if (resellerUserWithUsage.totalLimitUsd != null) {
            // 有总限额：套餐剩余 + 余额
            availableQuota =
              Math.max(
                0,
                resellerUserWithUsage.totalLimitUsd -
                  (resellerUserWithUsage.userAggregateTotalUsage ?? 0)
              ) + (resellerUserWithUsage.balanceUsd ?? 0);
          } else {
            // 无总限额：仅余额
            availableQuota = resellerUserWithUsage.balanceUsd ?? 0;
          }

          // 校验增加金额
          if (availableQuota != null && adjustAmount > availableQuota) {
            logger.warn("[BalanceAction] Adjustment amount exceeds reseller's available quota", {
              userId,
              adjustAmount,
              operatorId: currentUser.id,
              availableQuota,
            });

            return {
              success: false,
              error: `增加金额 $${adjustAmount.toFixed(2)} 超过了您的总可用额度 $${availableQuota.toFixed(2)}（套餐剩余 + 余额）`,
            };
          }

          logger.info("[BalanceAction] Reseller quota check passed (adjustment)", {
            userId,
            adjustAmount,
            operatorId: currentUser.id,
            availableQuota,
          });
        }
      }
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
