"use client";
import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import { ExpirySelector } from "@/components/ui/expiry-selector";
import { formatDateTimeLocal } from "@/lib/utils/datetime";

interface UserFormProps {
  user?: {
    id: number;
    name: string;
    note?: string;
    providerGroup?: string | null;
    tags?: string[];
    expiresAt?: string | null;
    isEnabled?: boolean;
  };
  onSuccess?: () => void;
  providerGroupOptions?: string[];
  availableTagOptions?: string[];
}

const MAX_TAGS = 10;

export function UserForm({
  user,
  onSuccess,
  providerGroupOptions = [],
  availableTagOptions = [],
}: UserFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isEdit = Boolean(user?.id);

  const form = useZodForm({
    schema: CreateUserSchema,
    defaultValues: {
      name: user?.name || "",
      note: user?.note || "",
      providerGroup: user?.providerGroup || "",
      tags: user?.tags || [],
      isEnabled: user?.isEnabled ?? true,
      expiresAt: user?.expiresAt ? formatDateTimeLocal(user.expiresAt) : "",
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
            });
          } else {
            res = await addUser({
              name: data.name,
              note: data.note,
              providerGroup: data.providerGroup || null,
              tags: data.tags,
              expiresAt: data.expiresAt ?? null,
              isEnabled: data.isEnabled,
            });
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

      <TextField
        label="备注"
        maxLength={200}
        placeholder="请输入备注（可选）"
        description="用于描述用户的用途或备注信息"
        {...form.getFieldProps("note")}
      />

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

      <ExpirySelector
        value={(form.values.expiresAt as string) || ""}
        onChange={(next) => form.setValue("expiresAt", next ?? "")}
      />

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
