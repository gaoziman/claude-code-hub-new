"use client";
import { useState } from "react";
import { SquarePen, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EditKeyForm } from "./forms/edit-key-form";
import { DeleteKeyConfirm } from "./forms/delete-key-confirm";
import type { UserKeyDisplay } from "@/types/user";
import type { User } from "@/types/user";
import { FormErrorBoundary } from "@/components/form-error-boundary";

interface KeyActionsProps {
  keyData: UserKeyDisplay;
  currentUser?: User;
  keyOwnerUserId: number; // 这个Key所属的用户ID
  canDelete: boolean;
  showLabels?: boolean;
  allowManage?: boolean;
}

export function KeyActions({
  keyData,
  currentUser,
  keyOwnerUserId,
  canDelete,
  showLabels = false,
  allowManage,
}: KeyActionsProps) {
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);

  // 权限检查：只有管理员或Key的拥有者才能编辑/删除
  const canManageKey = (() => {
    if (currentUser?.role === "admin") return true;
    if (allowManage && keyData.scope === "child") return true;
    return false;
  })();

  // 如果没有权限，不显示任何操作按钮
  if (!canManageKey) {
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      {/* 编辑Key */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label="编辑密钥"
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            title="编辑"
          >
            <SquarePen className="h-4 w-4" />
            {showLabels && <span>编辑</span>}
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl md:max-w-3xl xl:max-w-4xl max-h-[90vh] overflow-y-auto">
          <FormErrorBoundary>
            <EditKeyForm keyData={keyData} onSuccess={() => setOpenEdit(false)} />
          </FormErrorBoundary>
        </DialogContent>
      </Dialog>

      {/* 删除Key */}
      {canDelete && (
        <Dialog open={openDelete} onOpenChange={setOpenDelete}>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label="删除密钥"
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-red-600"
              title="删除"
            >
              <Trash2 className="h-4 w-4" />
              {showLabels && <span>删除</span>}
            </button>
          </DialogTrigger>
          <DialogContent>
            <FormErrorBoundary>
              <DeleteKeyConfirm keyData={keyData} onSuccess={() => setOpenDelete(false)} />
            </FormErrorBoundary>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
