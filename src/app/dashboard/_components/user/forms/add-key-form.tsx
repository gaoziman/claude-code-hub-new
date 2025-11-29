"use client";
import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { toast } from "sonner";
import { addKey } from "@/actions/keys";
import { DialogFormLayout } from "@/components/form/form-layout";
import { TextField, NumberField } from "@/components/form/form-field";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useZodForm } from "@/lib/hooks/use-zod-form";
import { KeyFormSchema } from "@/lib/validation/schemas";
import { ExpirySelector } from "@/components/ui/expiry-selector";
import { getResetInfo } from "@/lib/rate-limit/time-utils";

interface AddKeyFormProps {
  userId?: number;
  onSuccess?: (result: { generatedKey: string; name: string }) => void;
  currentUserRole?: "admin" | "reseller" | "user"; // 新增：当前用户角色
}

export function AddKeyForm({ userId, onSuccess, currentUserRole = "user" }: AddKeyFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // 判断是否显示高级配置（仅管理员显示）
  const showAdvancedFields = currentUserRole === "admin";

  // 计算周限额和月限额的重置时间说明
  const weeklyResetInfo = useMemo(() => {
    const resetInfo = getResetInfo("weekly");
    if (resetInfo.resetAt) {
      const resetTime = format(resetInfo.resetAt, "M月d日(E) HH:mm", { locale: zhCN });
      return `每周最大消费金额，从周一 00:00 开始计算，将于 ${resetTime} 重置`;
    }
    return "每周最大消费金额";
  }, []);

  const monthlyResetInfo = useMemo(() => {
    const resetInfo = getResetInfo("monthly");
    if (resetInfo.resetAt) {
      const resetTime = format(resetInfo.resetAt, "M月d日 HH:mm", { locale: zhCN });
      return `每月最大消费金额，从每月1号 00:00 开始计算，将于 ${resetTime} 重置`;
    }
    return "每月最大消费金额";
  }, []);

  const form = useZodForm({
    schema: KeyFormSchema,
    defaultValues: {
      name: "",
      expiresAt: "",
      canLoginWebUi: true,
      // 独立限额
      limit5hUsd: null,
      limitWeeklyUsd: null,
      limitMonthlyUsd: null,
      totalLimitUsd: null,
      limitConcurrentSessions: 0,
      rpmLimit: null,
      dailyQuota: null,
    },
    onSubmit: async (data) => {
      if (!userId) {
        throw new Error("用户ID不存在");
      }

      try {
        const result = await addKey({
          userId: userId!,
          name: data.name,
          expiresAt: data.expiresAt || undefined,
          canLoginWebUi: data.canLoginWebUi,
          // 独立限额
          limit5hUsd: data.limit5hUsd,
          limitWeeklyUsd: data.limitWeeklyUsd,
          limitMonthlyUsd: data.limitMonthlyUsd,
          totalLimitUsd: data.totalLimitUsd,
          limitConcurrentSessions: data.limitConcurrentSessions,
          rpmLimit: data.rpmLimit,
          dailyQuota: data.dailyQuota,
        });

        if (!result.ok) {
          toast.error(result.error || "创建失败，请稍后重试");
          return;
        }

        const payload = result.data;
        if (!payload) {
          toast.error("创建成功但未返回密钥");
          return;
        }

        startTransition(() => {
          onSuccess?.({ generatedKey: payload.generatedKey, name: payload.name });
          router.refresh();
        });
      } catch (err) {
        console.error("添加Key失败:", err);
        // 使用toast显示具体的错误信息
        const errorMessage = err instanceof Error ? err.message : "创建失败，请稍后重试";
        toast.error(errorMessage);
      }
    },
  });

  return (
    <DialogFormLayout
      config={{
        title: "新增 Key",
        description: "创建新的API密钥，Key值将自动生成。",
        submitText: "确认创建",
        loadingText: "创建中...",
      }}
      onSubmit={form.handleSubmit}
      isSubmitting={isPending}
      canSubmit={form.canSubmit && !!userId}
      error={form.errors._form}
    >
      <TextField
        label="Key名称"
        required
        maxLength={64}
        autoFocus
        placeholder="请输入Key名称"
        {...form.getFieldProps("name")}
      />

      {/* 以下字段仅管理员可见 */}
      {showAdvancedFields && (
        <>
          <ExpirySelector
            value={form.values.expiresAt as string}
            onChange={(next) => form.setValue("expiresAt", next ?? "")}
          />

          <div className="flex items-start justify-between gap-4 rounded-lg border border-dashed border-border px-4 py-3">
            <div>
              <Label htmlFor="can-login-web-ui" className="text-sm font-medium">
                允许登录 Web UI
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                关闭后，此 Key 仅可用于 API 调用，无法登录管理后台
              </p>
            </div>
            <Switch
              id="can-login-web-ui"
              checked={form.values.canLoginWebUi}
              onCheckedChange={(checked) => form.setValue("canLoginWebUi", checked)}
            />
          </div>

          <NumberField
            label="5小时消费上限 (USD)"
            placeholder="留空表示无限制"
            description="5小时内最大消费金额"
            min={0}
            step={0.01}
            {...form.getFieldProps("limit5hUsd")}
          />

          <NumberField
            label="周消费上限 (USD)"
            placeholder="留空表示无限制"
            description={weeklyResetInfo}
            min={0}
            step={0.01}
            {...form.getFieldProps("limitWeeklyUsd")}
          />

          <NumberField
            label="月消费上限 (USD)"
            placeholder="留空表示无限制"
            description={monthlyResetInfo}
            min={0}
            step={0.01}
            {...form.getFieldProps("limitMonthlyUsd")}
          />

          <NumberField
            label="总费用上限 (USD)"
            placeholder="留空表示无限制"
            description="该 Key 生命周期内允许的最大消费"
            min={0}
            step={0.01}
            {...form.getFieldProps("totalLimitUsd")}
          />

          <NumberField
            label="并发 Session 上限"
            placeholder="0 表示无限制"
            description="同时运行的对话数量"
            min={0}
            step={1}
            {...form.getFieldProps("limitConcurrentSessions")}
          />

          <NumberField
            label="RPM 限制"
            placeholder="留空表示无限制"
            description="该 Key 每分钟允许的最大请求数"
            min={1}
            step={1}
            {...form.getFieldProps("rpmLimit")}
          />

          <NumberField
            label="每日额度 (USD)"
            placeholder="留空表示无限制"
            description="该 Key 每日允许的最大消费金额"
            min={0.01}
            step={0.01}
            {...form.getFieldProps("dailyQuota")}
          />
        </>
      )}
    </DialogFormLayout>
  );
}
