"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { addUser, editUser } from "@/actions/users";
import { DialogFormLayout } from "@/components/form/form-layout";
import { TextField } from "@/components/form/form-field";
import { useZodForm } from "@/lib/hooks/use-zod-form";
import { CreateUserSchema } from "@/lib/validation/schemas";
import { toast } from "sonner";
import { TagInput } from "@/components/ui/tag-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ProviderGroupSelect } from "./provider-group-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ExpirySelector } from "@/components/ui/expiry-selector";
import { formatDateTimeLocal } from "@/lib/utils/datetime";
import { getResetInfoForBillingPeriod } from "@/lib/rate-limit/time-utils";
import { PasswordDisplayDialog } from "../password-display-dialog";
import { cn } from "@/lib/utils"; // 添加 cn 工具函数导入

interface UserFormProps {
  user?: {
    id: number;
    name: string;
    note?: string;
    providerGroup?: string | null;
    tags?: string[];
    expiresAt?: string | null;
    isEnabled?: boolean;
    // 用户级别限额
    limit5hUsd?: number | null;
    limitWeeklyUsd?: number | null;
    limitMonthlyUsd?: number | null;
    totalLimitUsd?: number | null;
    // Key 管理配置
    maxKeysCount?: number;
    // 账期周期配置
    billingCycleStart?: Date | null;
    // 余额使用策略
    balanceUsagePolicy?: "disabled" | "after_quota" | "priority";
  };
  onSuccess?: () => void;
  providerGroupOptions?: string[];
  availableTagOptions?: string[];
  currentUserRole?: "admin" | "reseller" | "user"; // 新增：当前用户角色
  currentUserLimits?: {
    // 新增：当前用户的限额信息（用于 Reseller 校验）
    // 总可用额度 = (套餐限额 - 已使用) + 余额
    // 后端校验逻辑：子用户限额 ≤ 父用户总可用额度
    limit5hUsd?: number | null;
    limitWeeklyUsd?: number | null;
    limitMonthlyUsd?: number | null;
    totalLimitUsd?: number | null;
  };
}

const MAX_TAGS = 10;

export function UserForm({
  user,
  onSuccess,
  providerGroupOptions = [],
  availableTagOptions = [],
  currentUserRole = "user",
  currentUserLimits, // 新增：当前用户限额
}: UserFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isEdit = Boolean(user?.id);

  // 密码显示对话框状态
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [createdUsername, setCreatedUsername] = useState("");

  // ========== 限额校验辅助函数 ==========
  // 检查输入值是否超过当前用户的限额
  const checkLimitExceeded = (
    inputValue: number | null | undefined,
    currentUserLimit: number | null | undefined
  ): boolean => {
    // 仅当当前用户是 Reseller 且设置了限额时才校验
    if (currentUserRole !== "reseller" || !currentUserLimit) {
      return false;
    }
    // 如果输入值为空或为 0，不算超限
    if (!inputValue || inputValue <= 0) {
      return false;
    }
    return inputValue > currentUserLimit;
  };

  const form = useZodForm({
    schema: CreateUserSchema,
    defaultValues: {
      name: user?.name || "",
      role: "user" as "admin" | "reseller" | "user",
      note: user?.note || "",
      providerGroup: user?.providerGroup || "",
      tags: user?.tags || [],
      isEnabled: user?.isEnabled ?? true,
      expiresAt: user?.expiresAt ? formatDateTimeLocal(user.expiresAt) : "",
      // 用户级别限额
      limit5hUsd: user?.limit5hUsd ?? null,
      limitWeeklyUsd: user?.limitWeeklyUsd ?? null,
      limitMonthlyUsd: user?.limitMonthlyUsd ?? null,
      totalLimitUsd: user?.totalLimitUsd ?? null,
      // Key 管理配置
      maxKeysCount: user?.maxKeysCount ?? 3,
      // 账期周期配置
      billingCycleStart: user?.billingCycleStart ? formatDateTimeLocal(user.billingCycleStart) : "",
      // 余额使用策略
      balanceUsagePolicy: user?.balanceUsagePolicy ?? "after_quota",
    },
    onSubmit: async (data) => {
      startTransition(async () => {
        try {
          let res;
          if (isEdit) {
            res = await editUser(user!.id, {
              name: data.name,
              note: data.note,
              providerGroup: data.providerGroup || null,
              tags: data.tags,
              expiresAt: data.expiresAt ?? null,
              isEnabled: data.isEnabled,
              // 用户级别限额
              limit5hUsd: data.limit5hUsd,
              limitWeeklyUsd: data.limitWeeklyUsd,
              limitMonthlyUsd: data.limitMonthlyUsd,
              totalLimitUsd: data.totalLimitUsd,
              // Key 管理配置
              maxKeysCount: data.maxKeysCount,
              // 账期周期配置
              billingCycleStart: data.billingCycleStart || null,
              // 余额使用策略
              balanceUsagePolicy: data.balanceUsagePolicy,
            });
          } else {
            res = await addUser({
              name: data.name,
              role: data.role,
              note: data.note,
              providerGroup: data.providerGroup || null,
              tags: data.tags,
              expiresAt: data.expiresAt ?? null,
              isEnabled: data.isEnabled,
              // 用户级别限额
              limit5hUsd: data.limit5hUsd,
              limitWeeklyUsd: data.limitWeeklyUsd,
              limitMonthlyUsd: data.limitMonthlyUsd,
              totalLimitUsd: data.totalLimitUsd,
              // Key 管理配置
              maxKeysCount: data.maxKeysCount,
              // 账期周期配置
              billingCycleStart: data.billingCycleStart || null,
              // 余额使用策略
              balanceUsagePolicy: data.balanceUsagePolicy,
            });

            // 检查是否生成了密码
            if (res.ok && res.data?.password) {
              setCreatedUsername(data.name);
              setGeneratedPassword(res.data.password);
              setShowPasswordDialog(true);
              return; // 先显示密码对话框，等用户确认后再调用 onSuccess
            }
          }

          if (!res.ok) {
            const msg = res.error || (isEdit ? "保存失败" : "创建失败，请稍后重试");
            toast.error(msg);
            return;
          }

          onSuccess?.();
          router.refresh();
        } catch (err) {
          console.error(`${isEdit ? "编辑" : "添加"}用户失败:`, err);
          toast.error(isEdit ? "保存失败，请稍后重试" : "创建失败，请稍后重试");
        }
      });
    },
  });

  // 密码对话框关闭处理器
  const handlePasswordDialogClose = () => {
    setShowPasswordDialog(false);
    setGeneratedPassword("");
    setCreatedUsername("");
    onSuccess?.();
    router.refresh();
  };

  const currentTags = (form.values.tags as string[]) || [];
  const handleSelectSuggestedTag = (tag: string) => {
    const normalized = tag.trim();
    if (!normalized || currentTags.length >= MAX_TAGS) {
      return;
    }
    if (currentTags.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
      return;
    }
    form.setValue("tags", [...currentTags, normalized]);
  };

  // 获取当前设置的账期起始日期
  const billingCycleStartValue = form.values.billingCycleStart as string;

  // 计算周限额和月限额的重置时间说明（基于账期周期）
  const weeklyResetInfo = useMemo(() => {
    const billingCycleStartDate = billingCycleStartValue ? new Date(billingCycleStartValue) : null;
    const resetInfo = getResetInfoForBillingPeriod("weekly", billingCycleStartDate);
    if (resetInfo.type === "billing" && resetInfo.resetAt) {
      return `从账期起始日开始每7天重置，将于 ${format(resetInfo.resetAt, "M月d日(E) HH:mm", { locale: zhCN })} 重置`;
    }
    if (resetInfo.type === "natural" && resetInfo.resetAt) {
      return `从每周一 00:00 开始计算，将于 ${format(resetInfo.resetAt, "M月d日(E) HH:mm", { locale: zhCN })} 重置`;
    }
    return null;
  }, [billingCycleStartValue]);

  const monthlyResetInfo = useMemo(() => {
    const billingCycleStartDate = billingCycleStartValue ? new Date(billingCycleStartValue) : null;
    const resetInfo = getResetInfoForBillingPeriod("monthly", billingCycleStartDate);
    if (resetInfo.type === "billing" && resetInfo.resetAt) {
      return `从账期起始日开始每30天重置，将于 ${format(resetInfo.resetAt, "M月d日 HH:mm", { locale: zhCN })} 重置`;
    }
    if (resetInfo.type === "natural" && resetInfo.resetAt) {
      return `从每月1号 00:00 开始计算，将于 ${format(resetInfo.resetAt, "M月d日 HH:mm", { locale: zhCN })} 重置`;
    }
    return null;
  }, [billingCycleStartValue]);

  return (
    <DialogFormLayout
      config={{
        title: isEdit ? "编辑用户" : "新增用户",
        description: isEdit ? "修改用户的基本信息。" : "创建新用户，系统将自动为其生成默认密钥。",
        submitText: isEdit ? "保存修改" : "确认创建",
        loadingText: isEdit ? "保存中..." : "创建中...",
      }}
      onSubmit={form.handleSubmit}
      isSubmitting={isPending}
      canSubmit={form.canSubmit}
      error={form.errors._form}
    >
      <TextField
        label="用户名"
        required
        maxLength={64}
        autoFocus
        placeholder="请输入用户名"
        {...form.getFieldProps("name")}
      />

      {/* 角色选择器 - 仅在创建用户时显示 */}
      {!isEdit && (
        <>
          {currentUserRole === "admin" ? (
            // 管理员：显示角色选择器
            <div className="space-y-2">
              <Label>
                用户角色 <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.values.role as string}
                onValueChange={(value) =>
                  form.setValue("role", value as "admin" | "reseller" | "user")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择用户角色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">普通用户</SelectItem>
                  <SelectItem value="reseller">代理用户</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                • 普通用户：可创建自己的密钥，查看自己的数据
                <br />• 代理用户：可创建子用户，管理子用户的密钥和数据
              </p>
            </div>
          ) : (
            // 代理用户：显示固定角色
            <div className="space-y-2">
              <Label>用户角色</Label>
              <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm">
                <span className="font-medium">普通用户</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  （代理用户只能创建普通用户）
                </span>
              </div>
            </div>
          )}
        </>
      )}

      <TextField
        label="备注"
        maxLength={200}
        placeholder="请输入备注（可选）"
        description="用于描述用户的用途或备注信息"
        {...form.getFieldProps("note")}
      />

      {/* 供应商分组和标签 - 仅管理员可见 */}
      {currentUserRole === "admin" && (
        <>
          <div className="space-y-2">
            <Label>供应商分组</Label>
            <ProviderGroupSelect
              value={(form.values.providerGroup as string) || ""}
              onChange={(next) => form.setValue("providerGroup", next)}
              options={providerGroupOptions}
              placeholder="选择或输入供应商分组（可选）"
            />
            <p className="text-xs text-muted-foreground">
              指定用户专属的供应商分组。可多选，系统仅会调度 groupTag
              匹配的供应商。留空表示可使用全部供应商。
            </p>
          </div>

          <div className="space-y-2">
            <Label>标签</Label>
            <SuggestedTags
              suggestions={availableTagOptions}
              selectedTags={currentTags}
              onSelect={handleSelectSuggestedTag}
              maxTags={MAX_TAGS}
            />
            <TagInput
              value={currentTags}
              onChange={(next) => form.setValue("tags", next)}
              placeholder="输入后按 Enter 添加标签"
              maxTags={MAX_TAGS}
            />
            <p className="text-xs text-muted-foreground">
              可添加多个标签，最多 10 个，自定义筛选使用。
            </p>
          </div>
        </>
      )}

      <ExpirySelector
        value={(form.values.expiresAt as string) || ""}
        onChange={(next) => form.setValue("expiresAt", next ?? "")}
      />

      <div className="space-y-3 rounded-xl border border-border/70 bg-muted/10 px-4 py-3">
        <div>
          <Label className="text-sm font-medium">用户级别消费限额</Label>
          <p className="text-xs text-muted-foreground mt-1">
            控制该用户所有密钥的总消费。留空表示无限制。
          </p>
        </div>

        {/* Key 数量限制 */}
        <div className="space-y-1">
          <TextField
            label="Key 数量限制"
            type="number"
            step="1"
            min="1"
            max="999"
            placeholder="默认 3"
            {...form.getFieldProps("maxKeysCount")}
            value={form.values.maxKeysCount ?? 3}
            onChange={(val) => {
              form.setValue("maxKeysCount", val === "" ? 3 : parseInt(val, 10));
            }}
          />
          <p className="text-[10px] text-muted-foreground">
            用户最多可以创建的 Key 数量（1-999，默认 3）
          </p>
        </div>

        {/* 账期起始日期设置 */}
        <div className="space-y-1">
          <TextField
            label="账期起始日期"
            type="datetime-local"
            placeholder="留空=使用自然周期"
            {...form.getFieldProps("billingCycleStart")}
            value={(form.values.billingCycleStart as string) || ""}
            onChange={(val) => {
              form.setValue("billingCycleStart", val || "");
            }}
          />
          <p className="text-[10px] text-muted-foreground">
            设置后，周限额将从此日期开始每7天重置，月限额每30天重置。留空则使用自然周（周一）和自然月（1号）。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <TextField
              label="5小时消费上限 (USD)"
              type="number"
              step="0.01"
              min="0"
              max="10000"
              placeholder="留空=无限制"
              {...form.getFieldProps("limit5hUsd")}
              value={form.values.limit5hUsd ?? ""}
              onChange={(val) => {
                form.setValue("limit5hUsd", val === "" ? null : parseFloat(val));
              }}
            />
            {/* Reseller 限额提示 */}
            {currentUserRole === "reseller" && currentUserLimits?.limit5hUsd != null && (
              <p
                className={cn(
                  "text-[10px]",
                  checkLimitExceeded(form.values.limit5hUsd as number, currentUserLimits.limit5hUsd)
                    ? "text-destructive font-medium"
                    : "text-muted-foreground"
                )}
              >
                {checkLimitExceeded(form.values.limit5hUsd as number, currentUserLimits.limit5hUsd)
                  ? `⚠️ 超过您的限额 $${currentUserLimits.limit5hUsd}`
                  : `您的限额：$${currentUserLimits.limit5hUsd}`}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <TextField
              label="周消费上限 (USD)"
              type="number"
              step="0.01"
              min="0"
              max="50000"
              placeholder="留空=无限制"
              {...form.getFieldProps("limitWeeklyUsd")}
              value={form.values.limitWeeklyUsd ?? ""}
              onChange={(val) => {
                form.setValue("limitWeeklyUsd", val === "" ? null : parseFloat(val));
              }}
            />
            {/* Reseller 限额提示 */}
            {currentUserRole === "reseller" && currentUserLimits?.limitWeeklyUsd != null && (
              <p
                className={cn(
                  "text-[10px]",
                  checkLimitExceeded(
                    form.values.limitWeeklyUsd as number,
                    currentUserLimits.limitWeeklyUsd
                  )
                    ? "text-destructive font-medium"
                    : "text-muted-foreground"
                )}
              >
                {checkLimitExceeded(
                  form.values.limitWeeklyUsd as number,
                  currentUserLimits.limitWeeklyUsd
                )
                  ? `⚠️ 超过您的总可用额度 $${currentUserLimits.limitWeeklyUsd.toFixed(2)}`
                  : `您的总可用额度：$${currentUserLimits.limitWeeklyUsd.toFixed(2)}（套餐剩余 + 余额）`}
              </p>
            )}
            {weeklyResetInfo && (
              <p className="text-[10px] text-muted-foreground">{weeklyResetInfo}</p>
            )}
          </div>
          <div className="space-y-1">
            <TextField
              label="月消费上限 (USD)"
              type="number"
              step="0.01"
              min="0"
              max="200000"
              placeholder="留空=无限制"
              {...form.getFieldProps("limitMonthlyUsd")}
              value={form.values.limitMonthlyUsd ?? ""}
              onChange={(val) => {
                form.setValue("limitMonthlyUsd", val === "" ? null : parseFloat(val));
              }}
            />
            {/* Reseller 限额提示 */}
            {currentUserRole === "reseller" && currentUserLimits?.limitMonthlyUsd != null && (
              <p
                className={cn(
                  "text-[10px]",
                  checkLimitExceeded(
                    form.values.limitMonthlyUsd as number,
                    currentUserLimits.limitMonthlyUsd
                  )
                    ? "text-destructive font-medium"
                    : "text-muted-foreground"
                )}
              >
                {checkLimitExceeded(
                  form.values.limitMonthlyUsd as number,
                  currentUserLimits.limitMonthlyUsd
                )
                  ? `⚠️ 超过您的总可用额度 $${currentUserLimits.limitMonthlyUsd.toFixed(2)}`
                  : `您的总可用额度：$${currentUserLimits.limitMonthlyUsd.toFixed(2)}（套餐剩余 + 余额）`}
              </p>
            )}
            {monthlyResetInfo && (
              <p className="text-[10px] text-muted-foreground">{monthlyResetInfo}</p>
            )}
          </div>
          <div className="space-y-1">
            <TextField
              label="总消费上限 (USD)"
              type="number"
              step="0.01"
              min="0"
              max="1000000"
              placeholder="留空=无限制"
              {...form.getFieldProps("totalLimitUsd")}
              value={form.values.totalLimitUsd ?? ""}
              onChange={(val) => {
                form.setValue("totalLimitUsd", val === "" ? null : parseFloat(val));
              }}
            />
            {/* Reseller 限额提示 */}
            {currentUserRole === "reseller" && currentUserLimits?.totalLimitUsd != null && (
              <p
                className={cn(
                  "text-[10px]",
                  checkLimitExceeded(
                    form.values.totalLimitUsd as number,
                    currentUserLimits.totalLimitUsd
                  )
                    ? "text-destructive font-medium"
                    : "text-muted-foreground"
                )}
              >
                {checkLimitExceeded(
                  form.values.totalLimitUsd as number,
                  currentUserLimits.totalLimitUsd
                )
                  ? `⚠️ 超过您的总可用额度 $${currentUserLimits.totalLimitUsd.toFixed(2)}`
                  : `您的总可用额度：$${currentUserLimits.totalLimitUsd.toFixed(2)}（套餐剩余 + 余额）`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 余额使用策略配置 */}
      <div className="space-y-3 rounded-xl border border-border/70 bg-muted/10 px-4 py-3">
        <div>
          <Label className="text-sm font-medium">余额使用策略</Label>
          <p className="text-xs text-muted-foreground mt-1">
            控制子用户如何使用账户余额（仅对子用户有效）
          </p>
        </div>

        <div className="space-y-2">
          <Select
            value={(form.values.balanceUsagePolicy as string) || "after_quota"}
            onValueChange={(value) =>
              form.setValue("balanceUsagePolicy", value as "disabled" | "after_quota" | "priority")
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="选择余额使用策略" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="disabled">
                <div className="flex flex-col items-start py-1">
                  <span className="font-medium">禁止使用余额</span>
                  <span className="text-xs text-muted-foreground">
                    套餐用完即停止，无法使用余额
                  </span>
                </div>
              </SelectItem>
              <SelectItem value="after_quota">
                <div className="flex flex-col items-start py-1">
                  <span className="font-medium">配额用完后可用余额（推荐）</span>
                  <span className="text-xs text-muted-foreground">
                    套餐优先，用完后可用余额继续服务
                  </span>
                </div>
              </SelectItem>
              <SelectItem value="priority">
                <div className="flex flex-col items-start py-1">
                  <span className="font-medium">优先使用余额</span>
                  <span className="text-xs text-muted-foreground">
                    余额优先扣款，余额不足才使用套餐
                  </span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            {form.values.balanceUsagePolicy === "disabled" &&
              "子用户无法使用账户余额，仅能使用分配的套餐配额"}
            {form.values.balanceUsagePolicy === "after_quota" &&
              "子用户套餐用完后可以使用余额继续服务，适合灵活充值场景"}
            {form.values.balanceUsagePolicy === "priority" &&
              "子用户优先使用余额，余额不足才使用套餐配额，适合按量付费场景"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border/70 bg-muted/10 px-4 py-3">
        <div>
          <Label className="text-sm font-medium">启用状态</Label>
          <p className="text-xs text-muted-foreground mt-1">
            关闭后该用户及其所有密钥都将无法调用 API。
          </p>
        </div>
        <Switch
          checked={Boolean(form.values.isEnabled ?? true)}
          onCheckedChange={(checked) => form.setValue("isEnabled", checked)}
        />
      </div>

      {/* 密码显示对话框 */}
      <PasswordDisplayDialog
        open={showPasswordDialog}
        onClose={handlePasswordDialogClose}
        username={createdUsername}
        password={generatedPassword}
      />
    </DialogFormLayout>
  );
}

function SuggestedTags({
  suggestions,
  selectedTags,
  onSelect,
  maxTags = 10,
}: {
  suggestions?: string[];
  selectedTags: string[];
  onSelect: (tag: string) => void;
  maxTags?: number;
}) {
  const normalized = useMemo(() => {
    if (!suggestions || suggestions.length === 0) {
      return [];
    }
    const seen = new Set<string>();
    for (const tag of suggestions) {
      const trimmed = tag.trim();
      if (!trimmed) continue;
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
      }
    }
    return Array.from(seen).slice(0, 12);
  }, [suggestions]);

  if (!normalized.length) {
    return null;
  }

  const lowerSelected = selectedTags.map((tag) => tag.toLowerCase());
  const atLimit = selectedTags.length >= maxTags;

  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 px-3 py-2">
      <p className="text-xs text-muted-foreground mb-2">常用标签（点击即可添加）</p>
      <div className="flex flex-wrap gap-2">
        {normalized.map((tag) => {
          const selected = lowerSelected.includes(tag.toLowerCase());
          const disabled = selected || atLimit;
          return (
            <Button
              key={tag}
              type="button"
              size="sm"
              variant={selected ? "secondary" : "outline"}
              disabled={disabled}
              className="rounded-full px-3 py-1 text-xs"
              onClick={() => onSelect(tag)}
            >
              {tag}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
