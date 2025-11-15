"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addKey } from "@/actions/keys";
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

interface AddKeyFormProps {
  userId?: number;
  allowScopeSelection?: boolean;
  onSuccess?: (result: { generatedKey: string; name: string }) => void;
}

export function AddKeyForm({ userId, onSuccess, allowScopeSelection = false }: AddKeyFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const form = useZodForm({
    schema: KeyFormSchema,
    defaultValues: {
      name: "",
      expiresAt: "",
      canLoginWebUi: true,
      scope: allowScopeSelection ? "owner" : "child",
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
          limit5hUsd: data.limit5hUsd,
          limitWeeklyUsd: data.limitWeeklyUsd,
          limitMonthlyUsd: data.limitMonthlyUsd,
          totalLimitUsd: data.totalLimitUsd,
          limitConcurrentSessions: data.limitConcurrentSessions,
          rpmLimit: data.rpmLimit,
          dailyQuota: data.dailyQuota,
          scope: allowScopeSelection ? data.scope : "child",
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
        description: "为当前用户创建新的API密钥，Key值将自动生成。",
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

      {allowScopeSelection && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border px-4 py-3">
          <Label className="text-sm font-medium">Key 视角</Label>
          <p className="text-xs text-muted-foreground">
            主 Key 可查看该用户所有数据；子 Key 仅能查看自身数据与限额
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
      )}

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
        description="每周最大消费金额"
        min={0}
        step={0.01}
        {...form.getFieldProps("limitWeeklyUsd")}
      />

      <NumberField
        label="月消费上限 (USD)"
        placeholder="留空表示无限制"
        description="每月最大消费金额"
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
