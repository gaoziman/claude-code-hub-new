"use client";

import { useState, useTransition } from "react";
import type { ProviderDisplay, ProviderGroupSummary } from "@/types/provider";
import type { User } from "@/types/user";
import type { CurrencyCode } from "@/lib/utils/currency";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Copy, Edit, RotateCcw, Trash2 } from "lucide-react";
import { ProviderDetailsDialog } from "./provider-details-dialog";
import { ProviderForm } from "./forms/provider-form";
import { FormErrorBoundary } from "@/components/form-error-boundary";
import { useProviderEdit } from "./hooks/use-provider-edit";
import { getProviderTypeConfig } from "@/lib/provider-type-utils";
import { useRouter } from "next/navigation";
import { removeProvider, resetProviderCircuit } from "@/actions/providers";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";

interface ProviderListTableProps {
  providers: ProviderDisplay[];
  currentUser?: User;
  healthStatus: Record<
    number,
    {
      circuitState: "closed" | "open" | "half-open";
      failureCount: number;
      lastFailureTime: number | null;
      circuitOpenUntil: number | null;
      recoveryMinutes: number | null;
    }
  >;
  currencyCode?: CurrencyCode;
  enableMultiProviderTypes: boolean;
  providerGroups: ProviderGroupSummary[];
  canManageGroups: boolean;
  onGroupsUpdated?: () => void;
}

export function ProviderListTable({
  providers,
  currentUser,
  healthStatus,
  currencyCode = "USD",
  enableMultiProviderTypes,
  providerGroups,
  canManageGroups,
  onGroupsUpdated,
}: ProviderListTableProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[220px]">供应商</TableHead>
              <TableHead className="min-w-[140px]">路由配置</TableHead>
              <TableHead className="min-w-[180px]">限流配置</TableHead>
              <TableHead className="min-w-[140px]">用量概览</TableHead>
              <TableHead className="min-w-[140px]">熔断状态</TableHead>
              <TableHead className="min-w-[140px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((provider) => (
              <ProviderTableRow
                key={provider.id}
                provider={provider}
                currentUser={currentUser}
                currencyCode={currencyCode}
                health={healthStatus[provider.id]}
                enableMultiProviderTypes={enableMultiProviderTypes}
                providerGroups={providerGroups}
                canManageGroups={canManageGroups}
                onGroupsUpdated={onGroupsUpdated}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

interface ProviderTableRowProps {
  provider: ProviderDisplay;
  currentUser?: User;
  health?: {
    circuitState: "closed" | "open" | "half-open";
    failureCount: number;
    lastFailureTime: number | null;
    circuitOpenUntil: number | null;
    recoveryMinutes: number | null;
  };
  currencyCode: CurrencyCode;
  enableMultiProviderTypes: boolean;
  providerGroups: ProviderGroupSummary[];
  canManageGroups: boolean;
  onGroupsUpdated?: () => void;
}

function ProviderTableRow({
  provider,
  currentUser,
  health,
  currencyCode,
  enableMultiProviderTypes,
  providerGroups,
  canManageGroups,
  onGroupsUpdated,
}: ProviderTableRowProps) {
  const router = useRouter();
  const [openEdit, setOpenEdit] = useState(false);
  const [openClone, setOpenClone] = useState(false);
  const [resetPending, startResetTransition] = useTransition();
  const [deletePending, startDeleteTransition] = useTransition();
  const canEdit = currentUser?.role === "admin";

  const { enabled, togglePending, handleToggle } = useProviderEdit(provider, canEdit);

  const typeConfig = getProviderTypeConfig(provider.providerType);
  const TypeIcon = typeConfig.icon;

  const handleResetCircuit = () => {
    startResetTransition(async () => {
      try {
        const res = await resetProviderCircuit(provider.id);
        if (res.ok) {
          toast.success("熔断器已重置", {
            description: `供应商 "${provider.name}" 的熔断状态已解除`,
          });
          router.refresh();
        } else {
          toast.error("重置熔断器失败", { description: res.error || "未知错误" });
        }
      } catch (error) {
        console.error("重置熔断器失败:", error);
        toast.error("重置熔断器失败", { description: "操作过程中出现异常" });
      }
    });
  };

  const handleDelete = () => {
    startDeleteTransition(async () => {
      try {
        const res = await removeProvider(provider.id);
        if (!res.ok) {
          toast.error("删除供应商失败", {
            description: res.error || "操作过程中出现未知错误",
          });
          return;
        }
        toast.success("供应商已删除", {
          description: `供应商 "${provider.name}" 已移除`,
        });
        router.refresh();
      } catch (error) {
        console.error("删除供应商失败:", error);
        toast.error("删除供应商失败", { description: "操作过程中出现异常" });
      }
    });
  };

  const handleFormSuccess = () => {
    setOpenEdit(false);
    setOpenClone(false);
    onGroupsUpdated?.();
    router.refresh();
  };

  const renderLimit = (value: number | null, unit: string) => {
    if (value === null || value === undefined) {
      return "∞";
    }
    return `${value}${unit}`;
  };

  const renderConcurrent = (value: number) => {
    if (value === 0) return "∞";
    return value.toString();
  };

  const todayCost = provider.todayTotalCostUsd
    ? formatCurrency(parseFloat(provider.todayTotalCostUsd), currencyCode)
    : formatCurrency(0, currencyCode);

  const todayCalls =
    provider.todayCallCount !== undefined ? `${provider.todayCallCount} 次` : "0 次";

  const healthBadge = (() => {
    if (!health)
      return {
        label: "未知",
        className: "bg-muted text-muted-foreground border-muted/50",
      };
    switch (health.circuitState) {
      case "closed":
        return {
          label: "正常",
          className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/40",
        };
      case "half-open":
        return {
          label: "恢复中",
          className: "bg-yellow-500/15 text-yellow-700 border-yellow-500/40",
        };
      case "open":
        return {
          label: "熔断中",
          className: "bg-destructive/10 text-destructive border-destructive/30",
        };
      default:
        return {
          label: "未知",
          className: "bg-muted text-muted-foreground border-muted/50",
        };
    }
  })();

  const needsReset = health?.circuitState === "open";

  return (
    <>
      <TableRow className="align-top">
        <TableCell>
          <div className="flex items-start gap-3">
            <Switch
              checked={enabled}
              onCheckedChange={(next) => handleToggle(next)}
              disabled={!canEdit || togglePending}
            />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-1 text-sm font-medium">
                <span>{provider.name}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[11px] font-medium border-transparent",
                    typeConfig.bgColor,
                    typeConfig.iconColor
                  )}
                >
                  <TypeIcon className={cn("h-3.5 w-3.5", typeConfig.iconColor)} />
                  {typeConfig.label}
                </Badge>
                {provider.groupTag && (
                  <Badge variant="secondary" className="text-[11px]">
                    {provider.groupTag}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground break-all">{provider.url}</div>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>优先级：{provider.priority}</div>
            <div>权重：{provider.weight}</div>
            <div>成本倍率：{provider.costMultiplier.toFixed(2)}x</div>
          </div>
        </TableCell>
        <TableCell>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>5小时：{renderLimit(provider.limit5hUsd, " USD")}</div>
            <div>周：{renderLimit(provider.limitWeeklyUsd, " USD")}</div>
            <div>月：{renderLimit(provider.limitMonthlyUsd, " USD")}</div>
            <div>并发：{renderConcurrent(provider.limitConcurrentSessions)}</div>
          </div>
        </TableCell>
        <TableCell>
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">{todayCost}</div>
            <div className="text-xs text-muted-foreground">{todayCalls}</div>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("text-xs", healthBadge.className)}>
              {healthBadge.label}
            </Badge>
            {needsReset && canEdit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    disabled={resetPending}
                    onClick={handleResetCircuit}
                  >
                    <RotateCcw className={resetPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>手动解除熔断</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TableCell>
        <TableCell>
          {canEdit ? (
            <div className="flex items-center gap-1">
              <ProviderDetailsDialog
                provider={provider}
                health={health}
                currencyCode={currencyCode}
                canEdit={canEdit}
                onEdit={() => setOpenEdit(true)}
                onClone={() => setOpenClone(true)}
                tooltip="详情"
                triggerButtonProps={{
                  variant: "ghost",
                  size: "icon",
                  className: "h-8 w-8",
                }}
              />
              <Dialog open={openEdit} onOpenChange={setOpenEdit}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>编辑</TooltipContent>
                </Tooltip>
                <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
                  <FormErrorBoundary>
                    <ProviderForm
                      mode="edit"
                      provider={provider}
                      enableMultiProviderTypes={enableMultiProviderTypes}
                      availableGroups={providerGroups}
                      canManageGroups={canManageGroups}
                      onGroupsUpdated={onGroupsUpdated}
                      onSuccess={handleFormSuccess}
                    />
                  </FormErrorBoundary>
                </DialogContent>
              </Dialog>

              <Dialog open={openClone} onOpenChange={setOpenClone}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>克隆</TooltipContent>
                </Tooltip>
                <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
                  <FormErrorBoundary>
                    <ProviderForm
                      mode="create"
                      cloneProvider={provider}
                      enableMultiProviderTypes={enableMultiProviderTypes}
                      availableGroups={providerGroups}
                      canManageGroups={canManageGroups}
                      onGroupsUpdated={onGroupsUpdated}
                      onSuccess={handleFormSuccess}
                    />
                  </FormErrorBoundary>
                </DialogContent>
              </Dialog>

              <AlertDialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        disabled={deletePending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>删除</TooltipContent>
                </Tooltip>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>删除供应商</AlertDialogTitle>
                    <AlertDialogDescription>
                      确定要删除供应商“{provider.name}”吗？此操作不可撤销，历史日志将被保留。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="flex justify-end gap-2">
                    <AlertDialogCancel disabled={deletePending}>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} disabled={deletePending}>
                      {deletePending ? "删除中..." : "确认删除"}
                    </AlertDialogAction>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">无权限</span>
          )}
        </TableCell>
      </TableRow>
    </>
  );
}
