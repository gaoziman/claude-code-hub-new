"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { rechargeUserBalanceAction } from "@/actions/balance";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const rechargeSchema = z.object({
  amount: z
    .string()
    .min(1, "请输入充值金额")
    .refine((val) => !isNaN(parseFloat(val)), "请输入有效数字")
    .refine((val) => parseFloat(val) > 0, "充值金额必须大于 0")
    .refine((val) => parseFloat(val) <= 10000, "单次充值金额不能超过 $10,000"),
  note: z.string().max(500, "备注不能超过 500 字符").optional(),
});

type RechargeFormData = z.infer<typeof rechargeSchema>;

interface RechargeBalanceFormProps {
  userId: number;
  userName: string;
  currentBalance: number;
  onSuccess?: () => void;
}

export function RechargeBalanceForm({
  userId,
  userName,
  currentBalance,
  onSuccess,
}: RechargeBalanceFormProps) {
  const [isPending, startTransition] = useTransition();
  const [previewBalance, setPreviewBalance] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
  } = useForm<RechargeFormData>({
    resolver: zodResolver(rechargeSchema),
    defaultValues: {
      amount: "",
      note: "",
    },
  });

  const amountValue = watch("amount");

  // 实时预览充值后余额
  const updatePreview = (amount: string) => {
    const parsed = parseFloat(amount);
    if (!isNaN(parsed) && parsed > 0) {
      setPreviewBalance(currentBalance + parsed);
    } else {
      setPreviewBalance(null);
    }
  };

  const onSubmit = async (data: RechargeFormData) => {
    const amount = parseFloat(data.amount);

    startTransition(async () => {
      try {
        const result = await rechargeUserBalanceAction(userId, amount, data.note || undefined);

        if (result.success && result.data) {
          toast.success("充值成功", {
            description: `已为用户 ${userName} 充值 $${amount.toFixed(2)}`,
          });

          reset();
          setPreviewBalance(null);
          onSuccess?.();
        } else {
          toast.error("充值失败", {
            description: result.error || "未知错误",
          });
        }
      } catch (error) {
        toast.error("充值失败", {
          description: error instanceof Error ? error.message : "网络错误，请稍后重试",
        });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* 标题 */}
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">充值余额</h2>
        <p className="text-sm text-muted-foreground">
          为用户 <span className="font-medium text-foreground">{userName}</span> 充值余额
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
              <p className="text-sm text-muted-foreground">充值后余额</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                ${previewBalance.toFixed(4)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 充值金额 */}
      <div className="space-y-2">
        <Label htmlFor="amount" className="text-sm font-medium">
          充值金额（美元） <span className="text-red-500">*</span>
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
              updatePreview(e.target.value);
            }}
            disabled={isPending}
          />
        </div>
        {errors.amount && (
          <p className="text-sm text-red-500">{errors.amount.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          单次充值金额范围：$0.01 ~ $10,000.00
        </p>
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
                register("amount").onChange({
                  target: { value: amount.toString() },
                });
                updatePreview(amount.toString());
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
          备注（可选）
        </Label>
        <Textarea
          id="note"
          placeholder="充值说明..."
          rows={3}
          {...register("note")}
          disabled={isPending}
        />
        {errors.note && (
          <p className="text-sm text-red-500">{errors.note.message}</p>
        )}
      </div>

      {/* 提交按钮 */}
      <div className="flex justify-end gap-3 pt-4">
        <Button type="submit" disabled={isPending || !amountValue}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          确认充值
        </Button>
      </div>
    </form>
  );
}
