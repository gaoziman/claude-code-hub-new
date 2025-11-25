"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { adjustUserBalanceAction } from "@/actions/balance";
import { toast } from "sonner";
import { Loader2, Plus, Minus } from "lucide-react";

const adjustSchema = z
  .object({
    operationType: z.enum(["increase", "decrease"]),
    amount: z
      .string()
      .min(1, "请输入调整金额")
      .refine((val) => !isNaN(parseFloat(val)), "请输入有效数字")
      .refine((val) => parseFloat(val) > 0, "调整金额必须大于 0")
      .refine((val) => parseFloat(val) <= 10000, "单次调整金额不能超过 $10,000"),
    note: z.string().max(500, "备注不能超过 500 字符"),
  })
  .refine(
    (data) => {
      // 减少余额时必须填写备注
      if (data.operationType === "decrease") {
        return data.note.trim().length > 0;
      }
      // 增加余额时备注可选
      return true;
    },
    {
      message: "减少余额时必须填写备注说明",
      path: ["note"],
    }
  );

type AdjustFormData = z.infer<typeof adjustSchema>;

interface AdjustBalanceFormProps {
  userId: number;
  userName: string;
  currentBalance: number;
  onSuccess?: () => void;
}

export function AdjustBalanceForm({
  userId,
  userName,
  currentBalance,
  onSuccess,
}: AdjustBalanceFormProps) {
  const [isPending, startTransition] = useTransition();
  const [previewBalance, setPreviewBalance] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<AdjustFormData>({
    resolver: zodResolver(adjustSchema),
    defaultValues: {
      operationType: "decrease",
      amount: "",
      note: "",
    },
  });

  const operationType = watch("operationType");
  const amountValue = watch("amount");

  // 实时预览调整后余额
  const updatePreview = (amount: string, opType: "increase" | "decrease") => {
    const parsed = parseFloat(amount);
    if (!isNaN(parsed) && parsed > 0) {
      const adjustedBalance =
        opType === "increase" ? currentBalance + parsed : currentBalance - parsed;
      setPreviewBalance(adjustedBalance);
    } else {
      setPreviewBalance(null);
    }
  };

  const onSubmit = async (data: AdjustFormData) => {
    const amount = parseFloat(data.amount);
    // 根据操作类型确定调整金额的正负
    const adjustAmount = data.operationType === "increase" ? amount : -amount;

    // 检查减少余额时是否会导致余额为负
    if (data.operationType === "decrease" && currentBalance - amount < 0) {
      toast.error("调整失败", {
        description: `当前余额 $${currentBalance.toFixed(2)}，减少 $${amount.toFixed(2)} 后余额将为负数`,
      });
      return;
    }

    startTransition(async () => {
      try {
        const result = await adjustUserBalanceAction(userId, adjustAmount, data.note);

        if (result.success && result.data) {
          const operationText = data.operationType === "increase" ? "增加" : "减少";
          toast.success("调整成功", {
            description: `已为用户 ${userName} ${operationText}余额 $${amount.toFixed(2)}`,
          });

          reset();
          setPreviewBalance(null);
          onSuccess?.();
        } else {
          toast.error("调整失败", {
            description: result.error || "未知错误",
          });
        }
      } catch (error) {
        toast.error("调整失败", {
          description: error instanceof Error ? error.message : "网络错误，请稍后重试",
        });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* 标题 */}
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">余额管理</h2>
        <p className="text-sm text-muted-foreground">
          为用户 <span className="font-medium text-foreground">{userName}</span> 充值或调整账户余额
        </p>
      </div>

      {/* 当前余额卡片 */}
      <div className="rounded-lg border bg-gradient-to-br from-orange-50/50 to-orange-100/30 dark:from-orange-950/20 dark:to-orange-900/10 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">当前余额</p>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              ${currentBalance.toFixed(4)}
            </p>
          </div>
          {previewBalance !== null && (
            <div className="text-right">
              <p className="text-sm text-muted-foreground">调整后余额</p>
              <p
                className={`text-2xl font-bold ${
                  previewBalance < 0
                    ? "text-red-600 dark:text-red-400"
                    : previewBalance > currentBalance
                      ? "text-green-600 dark:text-green-400"
                      : "text-blue-600 dark:text-blue-400"
                }`}
              >
                ${previewBalance.toFixed(4)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 操作类型 */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          操作类型 <span className="text-red-500">*</span>
        </Label>
        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant={operationType === "increase" ? "default" : "outline"}
            className="h-auto flex-col gap-2 py-3"
            onClick={() => {
              setValue("operationType", "increase");
              updatePreview(amountValue, "increase");
            }}
            disabled={isPending}
          >
            <Plus className="h-5 w-5" />
            <span>增加余额</span>
          </Button>
          <Button
            type="button"
            variant={operationType === "decrease" ? "default" : "outline"}
            className="h-auto flex-col gap-2 py-3"
            onClick={() => {
              setValue("operationType", "decrease");
              updatePreview(amountValue, "decrease");
            }}
            disabled={isPending}
          >
            <Minus className="h-5 w-5" />
            <span>减少余额</span>
          </Button>
        </div>
        {errors.operationType && (
          <p className="text-sm text-red-500">{errors.operationType.message}</p>
        )}
      </div>

      {/* 调整金额 */}
      <div className="space-y-2">
        <Label htmlFor="amount" className="text-sm font-medium">
          调整金额（美元） <span className="text-red-500">*</span>
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
          <Input
            id="amount"
            type="number"
            step="0.01"
            placeholder="0.00"
            className="pl-7"
            {...register("amount")}
            onChange={(e) => {
              register("amount").onChange(e);
              updatePreview(e.target.value, operationType);
            }}
            disabled={isPending}
          />
        </div>
        {errors.amount && <p className="text-sm text-red-500">{errors.amount.message}</p>}
        <p className="text-xs text-muted-foreground">单次调整金额范围：$0.01 ~ $10,000.00</p>
      </div>

      {/* 快捷金额按钮 */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">快捷金额</Label>
        <div className="grid grid-cols-4 gap-2">
          {[10, 50, 100, 500].map((amount) => (
            <Button
              key={amount}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setValue("amount", amount.toString());
                updatePreview(amount.toString(), operationType);
              }}
              disabled={isPending}
            >
              ${amount}
            </Button>
          ))}
        </div>
      </div>

      {/* 备注 */}
      <div className="space-y-2">
        <Label htmlFor="note" className="text-sm font-medium">
          {operationType === "decrease" ? "调整原因" : "备注说明（可选）"}
          {operationType === "decrease" && <span className="text-red-500"> *</span>}
        </Label>
        <Textarea
          id="note"
          placeholder={
            operationType === "decrease" ? "请详细说明减少余额的原因..." : "充值说明或备注信息..."
          }
          rows={3}
          {...register("note")}
          disabled={isPending}
        />
        {errors.note && <p className="text-sm text-red-500">{errors.note.message}</p>}
        <p className="text-xs text-muted-foreground">
          {operationType === "decrease"
            ? "减少余额必须填写备注说明，用于审计追踪"
            : "增加余额时备注可选"}
        </p>
      </div>

      {/* 警告提示（仅减少余额时显示） */}
      {operationType === "decrease" && amountValue && parseFloat(amountValue) > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-900/30 dark:bg-orange-950/20 p-3">
          <p className="text-sm text-orange-800 dark:text-orange-200">
            <strong>注意：</strong>减少余额操作将直接扣除用户账户余额，请确认操作无误
          </p>
        </div>
      )}

      {/* 提交按钮 */}
      <div className="flex justify-end gap-3 pt-4">
        <Button type="submit" disabled={isPending || !amountValue}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          确认调整
        </Button>
      </div>
    </form>
  );
}
