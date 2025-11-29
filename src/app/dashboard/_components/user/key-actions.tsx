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
  allowEdit?: boolean; // 是否允许编辑（仅管理员）
  allowManage?: boolean; 
}

export function KeyActions({
  keyData,
  currentUser,
  canDelete,
  showLabels = false,
  allowEdit = false, // 默认不允许编辑
  allowManage,
}: KeyActionsProps) {
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);

  // 编辑权限：管理员和代理用户可以编辑密钥配置
  const canEditKey =
    allowEdit && (currentUser?.role === "admin" || currentUser?.role === "reseller");

  // 删除权限：管理员或密钥拥有者可以删除
  const canDeleteKey = (() => {
    if (currentUser?.role === "admin") return true;
    if (allowManage) return true; // 普通用户查看自己的密钥时，allowManage=true
    return false;
  })();

  // 如果没有任何权限，不显示操作按钮
  if (!canEditKey && !canDeleteKey) {
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      {/* 编辑Key - ⭐ 仅管理员可见 */}
      {canEditKey && (
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
      )}

      {/* 删除Key - ⭐ 管理员和密钥拥有者可见 */}
      {canDeleteKey && canDelete && (
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
