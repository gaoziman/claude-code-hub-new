"use client";
import { useState } from "react";
import { SquarePen, Trash, PiggyBank, KeyRound } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { UserForm } from "./forms/user-form";
import { DeleteUserConfirm } from "./forms/delete-user-confirm";
import { AdjustBalanceForm } from "./forms/adjust-balance-form";
import { ResetPasswordDialog } from "./reset-password-dialog";
import type { UserDisplay, User } from "@/types/user";
import { FormErrorBoundary } from "@/components/form-error-boundary";

interface UserActionsProps {
  user: UserDisplay;
  currentUser?: User;
  currentUserDisplay?: UserDisplay | null; // 新增：当前用户完整数据（包含 usage），允许 null
  showLabels?: boolean;
  providerGroupOptions?: string[];
  availableTags?: string[];
}

export function UserActions({
  user,
  currentUser,
  currentUserDisplay,
  showLabels = false,
  providerGroupOptions = [],
  availableTags = [],
}: UserActionsProps) {
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [openAdjust, setOpenAdjust] = useState(false);
  const [openResetPassword, setOpenResetPassword] = useState(false);

  // 权限检查：
  // 1. 管理员可以编辑所有用户
  // 2. 代理用户可以编辑自己和自己创建的子用户（user.parentUserId === currentUser.id）
  const canEditUser =
    currentUser?.role === "admin" ||
    (currentUser?.role === "reseller" && (
      user.id === currentUser.id || // 编辑自己
      user.parentUserId === currentUser.id // 编辑子用户
    ));

  // 如果没有权限，不显示任何按钮
  if (!canEditUser) {
    return null;
  }

  // 提取当前用户的限额信息（仅 Reseller 编辑子用户时需要）
  // 计算"总可用额度" = (套餐限额 - 已使用) + 余额
  const currentUserLimits =
    currentUser?.role === "reseller" && user.id !== currentUser.id && currentUserDisplay
      ? {
          // 5小时：原始限额（无实时 usage 数据）
          limit5hUsd: currentUser.limit5hUsd ?? null,
          // 周限额：套餐剩余 + 余额
          limitWeeklyUsd:
            currentUser.limitWeeklyUsd != null
              ? Math.max(0, currentUser.limitWeeklyUsd - (currentUserDisplay.userAggregateWeeklyUsage ?? 0)) +
                (currentUserDisplay.balanceUsd ?? 0)
              : (currentUserDisplay.balanceUsd ?? 0) || null,
          // 月限额：套餐剩余 + 余额
          limitMonthlyUsd:
            currentUser.limitMonthlyUsd != null
              ? Math.max(0, currentUser.limitMonthlyUsd - (currentUserDisplay.userAggregateMonthlyUsage ?? 0)) +
                (currentUserDisplay.balanceUsd ?? 0)
              : (currentUserDisplay.balanceUsd ?? 0) || null,
          // 总限额：套餐剩余 + 余额
          totalLimitUsd:
            currentUser.totalLimitUsd != null
              ? Math.max(0, currentUser.totalLimitUsd - (currentUserDisplay.userAggregateTotalUsage ?? 0)) +
                (currentUserDisplay.balanceUsd ?? 0)
              : (currentUserDisplay.balanceUsd ?? 0) || null,
        }
      : undefined;

  return (
    <div className="flex items-center gap-1">
      {/* 编辑用户 */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label="编辑用户"
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            title="编辑用户"
          >
            <SquarePen className="h-3.5 w-3.5" />
            {showLabels && <span>编辑</span>}
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl md:max-w-3xl xl:max-w-4xl max-h-[90vh] overflow-y-auto">
          <FormErrorBoundary>
            <UserForm
              user={user}
              onSuccess={() => setOpenEdit(false)}
              providerGroupOptions={providerGroupOptions}
              availableTagOptions={availableTags}
              currentUserRole={currentUser?.role}
              currentUserLimits={currentUserLimits}
            />
          </FormErrorBoundary>
        </DialogContent>
      </Dialog>

      {/* 余额管理 */}
      <Dialog open={openAdjust} onOpenChange={setOpenAdjust}>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label="余额管理"
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-blue-600"
            title="余额管理"
          >
            <PiggyBank className="h-3.5 w-3.5" />
            {showLabels && <span>余额</span>}
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <FormErrorBoundary>
            <AdjustBalanceForm
              userId={user.id}
              userName={user.name}
              currentBalance={user.balanceUsd ?? 0}
              onSuccess={() => setOpenAdjust(false)}
            />
          </FormErrorBoundary>
        </DialogContent>
      </Dialog>

      {/* 重置密码 */}
      <ResetPasswordDialog
        open={openResetPassword}
        onClose={() => setOpenResetPassword(false)}
        userId={user.id}
        username={user.name}
      />
      <button
        type="button"
        aria-label="重置密码"
        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-orange-600"
        title="重置密码"
        onClick={() => setOpenResetPassword(true)}
      >
        <KeyRound className="h-3.5 w-3.5" />
        {showLabels && <span>重置密码</span>}
      </button>

      {/* 删除用户 */}
      <Dialog open={openDelete} onOpenChange={setOpenDelete}>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label="删除用户"
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-red-600"
            title="删除用户"
          >
            <Trash className="h-3.5 w-3.5" />
            {showLabels && <span>删除</span>}
          </button>
        </DialogTrigger>
        <DialogContent>
          <FormErrorBoundary>
            <DeleteUserConfirm user={user} onSuccess={() => setOpenDelete(false)} />
          </FormErrorBoundary>
        </DialogContent>
      </Dialog>
    </div>
  );
}
