"use client";
import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { editKey } from "@/actions/keys";
import { DialogFormLayout } from "@/components/form/form-layout";
import { TextField, NumberField } from "@/components/form/form-field";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useZodForm } from "@/lib/hooks/use-zod-form";
import { KeyFormSchema } from "@/lib/validation/schemas";
import { ExpirySelector } from "@/components/ui/expiry-selector";
import { formatDateTimeLocal } from "@/lib/utils/datetime";
import { toast } from "sonner";
import { getResetInfo } from "@/lib/rate-limit/time-utils";

interface EditKeyFormProps {
  keyData?: {
    id: number;
    name: string;
    expiresAt: string;
    canLoginWebUi?: boolean;
    limit5hUsd?: number | null;
    limitWeeklyUsd?: number | null;
    limitMonthlyUsd?: number | null;
    totalLimitUsd?: number | null;
    limitConcurrentSessions?: number;
    rpmLimit?: number | null;
    dailyQuota?: number | null;
    scope?: "owner" | "child";
  };
  onSuccess?: () => void;
}

export function EditKeyForm({ keyData, onSuccess }: EditKeyFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const formatExpiresAt = (expiresAt?: string | null) => {
    if (!expiresAt || expiresAt === "永不过期") return "";
    return formatDateTimeLocal(expiresAt);
  };

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
      name: keyData?.name || "",
      expiresAt: formatExpiresAt(keyData?.expiresAt || ""),
      canLoginWebUi: keyData?.canLoginWebUi ?? true,
      scope: keyData?.scope ?? "owner",
      limit5hUsd: keyData?.limit5hUsd ?? null,
      limitWeeklyUsd: keyData?.limitWeeklyUsd ?? null,
      limitMonthlyUsd: keyData?.limitMonthlyUsd ?? null,
      totalLimitUsd: keyData?.totalLimitUsd ?? null,
      limitConcurrentSessions: keyData?.limitConcurrentSessions ?? 0,
      rpmLimit: keyData?.rpmLimit ?? null,
      dailyQuota: keyData?.dailyQuota ?? null,
    },
    onSubmit: async (data) => {
      if (!keyData) {
        throw new Error("密钥信息不存在");
      }

      startTransition(async () => {
        try {
          const res = await editKey(keyData.id, {
            name: data.name,
            expiresAt: data.expiresAt || undefined,
            canLoginWebUi: data.canLoginWebUi,
            limit5hUsd: data.limit5hUsd,
            limitWeeklyUsd: data.limitWeeklyUsd,
            limitMonthlyUsd: data.limitMonthlyUsd,
            totalLimitUsd: data.totalLimitUsd,
            limitConcurrentSessions: data.limitConcurrentSessions,
            rpmLimit: data.rpmLimit,
            dailyQuota: data.dailyQuota,
            scope: data.scope,
          });
          if (!res.ok) {
            toast.error(res.error || "保存失败");
            return;
          }
          onSuccess?.();
          router.refresh();
        } catch (err) {
          console.error("编辑Key失败:", err);
          toast.error("保存失败，请稍后重试");
        }
      });
    },
  });

  return (
    <DialogFormLayout
      config={{
        title: "编辑 Key",
        description: "修改密钥的名称、过期时间和限流配置。",
        submitText: "保存修改",
        loadingText: "保存中...",
      }}
      onSubmit={form.handleSubmit}
      isSubmitting={isPending}
      canSubmit={form.canSubmit}
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

      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border px-4 py-3">
        <Label className="text-sm font-medium">Key 视角</Label>
        <p className="text-xs text-muted-foreground">
          主 Key 可以查看用户全量数据；子 Key 仅可访问自身数据和限额
        </p>
        <Select
          value={form.values.scope}
          onValueChange={(value: "owner" | "child") => form.setValue("scope", value)}
        >
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder="选择 Key 视角" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="owner">主 Key（汇总视角）</SelectItem>
            <SelectItem value="child">子 Key（独立视角）</SelectItem>
          </SelectContent>
        </Select>
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
    </DialogFormLayout>
  );
}
