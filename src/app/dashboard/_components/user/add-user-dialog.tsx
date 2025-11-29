"use client";
import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ListPlus } from "lucide-react";
import { UserForm } from "./forms/user-form";
import { FormErrorBoundary } from "@/components/form-error-boundary";
import type { User, UserDisplay } from "@/types/user";

type ButtonProps = ComponentProps<typeof Button>;

interface AddUserDialogProps {
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  providerGroupOptions?: string[];
  availableTags?: string[];
  currentUser?: User; // 当前用户信息（用于角色判断）
  currentUserDisplay?: UserDisplay | null; // 当前用户完整数据（包含 usage），允许 null
}

export function AddUserDialog({
  variant = "default",
  size = "default",
  className,
  providerGroupOptions = [],
  availableTags = [],
  currentUser,
  currentUserDisplay,
}: AddUserDialogProps) {
  const [open, setOpen] = useState(false);

  // ⭐ 提取当前用户的限额信息（用于 Reseller 校验）
  // 计算"总可用额度" = (套餐限额 - 已使用) + 余额
  // 这样可以让 Reseller 充分利用自己的余额来分配给子用户
  const currentUserLimits =
    currentUser?.role === "reseller" && currentUserDisplay
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <ListPlus className="h-4 w-4" /> 新增用户
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl md:max-w-3xl xl:max-w-4xl max-h-[90vh] overflow-y-auto">
        <FormErrorBoundary>
          <UserForm
            onSuccess={() => setOpen(false)}
            providerGroupOptions={providerGroupOptions}
            availableTagOptions={availableTags}
            currentUserRole={currentUser?.role}
            currentUserLimits={currentUserLimits}
          />
        </FormErrorBoundary>
      </DialogContent>
    </Dialog>
  );
}
