"use client";
import { useState } from "react";
import { SquarePen, Trash, PiggyBank } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { UserForm } from "./forms/user-form";
import { DeleteUserConfirm } from "./forms/delete-user-confirm";
import { AdjustBalanceForm } from "./forms/adjust-balance-form";
import type { UserDisplay, User } from "@/types/user";
import { FormErrorBoundary } from "@/components/form-error-boundary";

interface UserActionsProps {
  user: UserDisplay;
  currentUser?: User;
  showLabels?: boolean;
  providerGroupOptions?: string[];
  availableTags?: string[];
}

export function UserActions({
  user,
  currentUser,
  showLabels = false,
  providerGroupOptions = [],
  availableTags = [],
}: UserActionsProps) {
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [openAdjust, setOpenAdjust] = useState(false);

  // 权限检查：只有管理员才能编辑用户信息
  const canEditUser = currentUser?.role === "admin";

  // 如果没有权限，不显示任何按钮
  if (!canEditUser) {
    return null;
  }

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
