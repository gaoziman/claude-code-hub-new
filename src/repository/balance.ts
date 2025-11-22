"use server";

import { db } from "@/drizzle/db";
import { users, balanceTransactions } from "@/drizzle/schema";
import { eq, desc, sql, and } from "drizzle-orm";

/**
 * 余额流水记录类型
 */
export interface BalanceTransaction {
  id: number;
  userId: number;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  type: 'recharge' | 'deduction' | 'refund' | 'adjustment';
  operatorId: number | null;
  operatorName: string | null;
  note: string | null;
  messageRequestId: number | null;
  createdAt: Date;
}

/**
 * 余额流水查询选项
 */
export interface BalanceTransactionQueryOptions {
  userId: number;
  type?: 'recharge' | 'deduction' | 'refund' | 'adjustment';
  limit?: number;
  offset?: number;
}

/**
 * 充值结果类型
 */
export interface RechargeResult {
  balanceBefore: number;
  balanceAfter: number;
  transactionId: number;
}

/**
 * 扣款结果类型
 */
export interface DeductionResult {
  balanceBefore: number;
  balanceAfter: number;
  transactionId: number;
}

/**
 * 余额调整结果类型
 */
export interface AdjustmentResult {
  balanceBefore: number;
  balanceAfter: number;
  transactionId: number;
}

/**
 * 获取用户当前余额（带行锁，用于事务中防止并发冲突）
 *
 * @param userId - 用户ID
 * @param forUpdate - 是否加行锁（默认 false）
 * @returns 用户余额（USD），如果用户不存在返回 null
 */
export async function getUserBalance(userId: number, forUpdate: boolean = false): Promise<number | null> {
  const query = db
    .select({ balanceUsd: users.balanceUsd })
    .from(users)
    .where(eq(users.id, userId));

  // 如果需要行锁，使用 FOR UPDATE
  if (forUpdate) {
    const result = await query.for("update");
    if (!result.length) return null;
    return parseFloat(result[0].balanceUsd || "0");
  }

  const result = await query;
  if (!result.length) return null;
  return parseFloat(result[0].balanceUsd || "0");
}

/**
 * 充值余额（管理员操作，使用数据库事务保证原子性）
 *
 * @param userId - 用户ID
 * @param amount - 充值金额（USD，必须 > 0）
 * @param operatorId - 操作者ID（管理员ID）
 * @param operatorName - 操作者名称
 * @param note - 备注（可选）
 * @returns 充值结果（包含充值前后余额、流水ID）
 * @throws 如果用户不存在或余额不足
 */
export async function rechargeBalance(
  userId: number,
  amount: number,
  operatorId: number,
  operatorName: string,
  note?: string
): Promise<RechargeResult> {
  if (amount <= 0) {
    throw new Error("充值金额必须大于 0");
  }

  // 使用事务确保原子性
  return await db.transaction(async (tx) => {
    // 1. 获取当前余额（加行锁防止并发冲突）
    const userResult = await tx
      .select({ balanceUsd: users.balanceUsd })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");

    if (!userResult.length) {
      throw new Error(`用户不存在: userId=${userId}`);
    }

    const balanceBefore = parseFloat(userResult[0].balanceUsd || "0");
    const balanceAfter = balanceBefore + amount;

    // 2. 更新余额
    await tx
      .update(users)
      .set({
        balanceUsd: balanceAfter.toFixed(4),
        balanceUpdatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // 3. 记录流水
    const [transaction] = await tx
      .insert(balanceTransactions)
      .values({
        userId,
        amount: amount.toFixed(4),
        balanceBefore: balanceBefore.toFixed(4),
        balanceAfter: balanceAfter.toFixed(4),
        type: "recharge",
        operatorId,
        operatorName,
        note: note || null,
        messageRequestId: null,
      })
      .returning({ id: balanceTransactions.id });

    return {
      balanceBefore,
      balanceAfter,
      transactionId: transaction.id,
    };
  });
}

/**
 * 扣除余额（系统自动扣款，使用数据库事务保证原子性）
 *
 * @param userId - 用户ID
 * @param amount - 扣款金额（USD，必须 > 0）
 * @param messageRequestId - 关联的消息请求ID（用于审计）
 * @returns 扣款结果（包含扣款前后余额、流水ID）
 * @throws 如果用户不存在或余额不足
 */
export async function deductBalance(
  userId: number,
  amount: number,
  messageRequestId: number
): Promise<DeductionResult> {
  if (amount <= 0) {
    throw new Error("扣款金额必须大于 0");
  }

  // 使用事务确保原子性
  return await db.transaction(async (tx) => {
    // 1. 获取当前余额（加行锁防止并发冲突）
    const userResult = await tx
      .select({ balanceUsd: users.balanceUsd })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");

    if (!userResult.length) {
      throw new Error(`用户不存在: userId=${userId}`);
    }

    const balanceBefore = parseFloat(userResult[0].balanceUsd || "0");
    const balanceAfter = balanceBefore - amount;

    // 2. 检查余额是否足够
    if (balanceAfter < 0) {
      throw new Error(`余额不足: 当前余额 $${balanceBefore.toFixed(4)}, 需要扣除 $${amount.toFixed(4)}`);
    }

    // 3. 更新余额
    await tx
      .update(users)
      .set({
        balanceUsd: balanceAfter.toFixed(4),
        balanceUpdatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // 4. 记录流水
    const [transaction] = await tx
      .insert(balanceTransactions)
      .values({
        userId,
        amount: (-amount).toFixed(4), // 扣款记录为负数
        balanceBefore: balanceBefore.toFixed(4),
        balanceAfter: balanceAfter.toFixed(4),
        type: "deduction",
        operatorId: null,
        operatorName: "system",
        note: `API调用扣款 (message_request.id=${messageRequestId})`,
        messageRequestId,
      })
      .returning({ id: balanceTransactions.id });

    return {
      balanceBefore,
      balanceAfter,
      transactionId: transaction.id,
    };
  });
}

/**
 * 调整余额（管理员手动调整，支持增加或减少，使用数据库事务保证原子性）
 *
 * @param userId - 用户ID
 * @param adjustAmount - 调整金额（USD，正数=增加余额，负数=减少余额）
 * @param operatorId - 操作者ID（管理员ID）
 * @param operatorName - 操作者名称
 * @param note - 备注（减少余额时必填，增加余额时可选）
 * @returns 调整结果（包含调整前后余额、流水ID）
 * @throws 如果用户不存在或余额不足（减少时）
 */
export async function adjustBalance(
  userId: number,
  adjustAmount: number,
  operatorId: number,
  operatorName: string,
  note: string
): Promise<AdjustmentResult> {
  if (adjustAmount === 0) {
    throw new Error("调整金额不能为 0");
  }

  // 减少余额时必须填写备注
  if (adjustAmount < 0 && (!note || note.trim() === "")) {
    throw new Error("减少余额时必须填写备注说明");
  }

  // 使用事务确保原子性
  return await db.transaction(async (tx) => {
    // 1. 获取当前余额（加行锁防止并发冲突）
    const userResult = await tx
      .select({ balanceUsd: users.balanceUsd })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");

    if (!userResult.length) {
      throw new Error(`用户不存在: userId=${userId}`);
    }

    const balanceBefore = parseFloat(userResult[0].balanceUsd || "0");
    const balanceAfter = balanceBefore + adjustAmount;

    // 2. 如果是减少余额，检查余额是否足够
    if (adjustAmount < 0 && balanceAfter < 0) {
      throw new Error(
        `余额不足: 当前余额 $${balanceBefore.toFixed(4)}, 尝试减少 $${Math.abs(adjustAmount).toFixed(4)}, 调整后余额将变为负数`
      );
    }

    // 3. 更新余额
    await tx
      .update(users)
      .set({
        balanceUsd: balanceAfter.toFixed(4),
        balanceUpdatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // 4. 记录流水
    const [transaction] = await tx
      .insert(balanceTransactions)
      .values({
        userId,
        amount: adjustAmount.toFixed(4),
        balanceBefore: balanceBefore.toFixed(4),
        balanceAfter: balanceAfter.toFixed(4),
        type: "adjustment",
        operatorId,
        operatorName,
        note: note.trim(),
        messageRequestId: null,
      })
      .returning({ id: balanceTransactions.id });

    return {
      balanceBefore,
      balanceAfter,
      transactionId: transaction.id,
    };
  });
}

/**
 * 查询余额流水（支持分页和类型筛选）
 *
 * @param options - 查询选项（userId 必填，type/limit/offset 可选）
 * @returns 余额流水列表
 */
export async function getBalanceTransactions(
  options: BalanceTransactionQueryOptions
): Promise<BalanceTransaction[]> {
  const { userId, type, limit = 50, offset = 0 } = options;

  // 构建查询条件
  const conditions = [eq(balanceTransactions.userId, userId)];
  if (type) {
    conditions.push(eq(balanceTransactions.type, type));
  }

  // 执行查询
  const result = await db
    .select({
      id: balanceTransactions.id,
      userId: balanceTransactions.userId,
      amount: balanceTransactions.amount,
      balanceBefore: balanceTransactions.balanceBefore,
      balanceAfter: balanceTransactions.balanceAfter,
      type: balanceTransactions.type,
      operatorId: balanceTransactions.operatorId,
      operatorName: balanceTransactions.operatorName,
      note: balanceTransactions.note,
      messageRequestId: balanceTransactions.messageRequestId,
      createdAt: balanceTransactions.createdAt,
    })
    .from(balanceTransactions)
    .where(and(...conditions))
    .orderBy(desc(balanceTransactions.createdAt))
    .limit(limit)
    .offset(offset);

  // 转换数据库类型到 TypeScript 类型
  return result.map((row) => ({
    id: row.id,
    userId: row.userId,
    amount: parseFloat(row.amount || "0"),
    balanceBefore: parseFloat(row.balanceBefore || "0"),
    balanceAfter: parseFloat(row.balanceAfter || "0"),
    type: row.type as 'recharge' | 'deduction' | 'refund' | 'adjustment',
    operatorId: row.operatorId,
    operatorName: row.operatorName,
    note: row.note,
    messageRequestId: row.messageRequestId,
    createdAt: row.createdAt!,
  }));
}

/**
 * 获取用户余额统计信息
 *
 * @param userId - 用户ID
 * @returns 统计信息（总充值、总消耗、当前余额）
 */
export async function getBalanceStats(userId: number): Promise<{
  totalRecharge: number;
  totalDeduction: number;
  currentBalance: number;
} | null> {
  // 查询当前余额
  const balance = await getUserBalance(userId);
  if (balance === null) return null;

  // 聚合统计
  const stats = await db
    .select({
      totalRecharge: sql<string>`COALESCE(SUM(CASE WHEN ${balanceTransactions.type} = 'recharge' THEN ${balanceTransactions.amount} ELSE 0 END), 0)`,
      totalDeduction: sql<string>`COALESCE(ABS(SUM(CASE WHEN ${balanceTransactions.type} = 'deduction' THEN ${balanceTransactions.amount} ELSE 0 END)), 0)`,
    })
    .from(balanceTransactions)
    .where(eq(balanceTransactions.userId, userId));

  return {
    totalRecharge: parseFloat(stats[0]?.totalRecharge || "0"),
    totalDeduction: parseFloat(stats[0]?.totalDeduction || "0"),
    currentBalance: balance,
  };
}
