"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Info, Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import type { CurrencyCode } from "@/lib/utils/currency";
import { getProviderTypeConfig } from "@/lib/provider-type-utils";
import type { ProviderDisplay, ProviderUsageTrendPoint } from "@/types/provider";
import { getProviderUsageTrend } from "@/actions/providers";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import ProviderUsageChart from "./provider-usage-chart";

interface ProviderDetailsDialogProps {
  provider: ProviderDisplay;
  health?: {
    circuitState: "closed" | "open" | "half-open";
    failureCount: number;
    lastFailureTime: number | null;
    circuitOpenUntil: number | null;
    recoveryMinutes: number | null;
  };
  currencyCode?: CurrencyCode;
  canEdit?: boolean;
  onEdit?: () => void;
  onClone?: () => void;
  triggerButtonProps?: React.ComponentProps<typeof Button>;
  tooltip?: string;
}

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value?: string | null) {
  if (!value) return "暂无记录";
  try {
    return dateTimeFormatter.format(new Date(value));
  } catch {
    return value;
  }
}

const healthStyles = {
  closed: {
    label: "正常",
    className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/40",
  },
  "half-open": {
    label: "恢复中",
    className: "bg-amber-500/20 text-amber-700 border-amber-500/40",
  },
  open: {
    label: "熔断中",
    className: "bg-destructive/15 text-destructive border-destructive/30",
  },
} as const;

export function ProviderDetailsDialog({
  provider,
  health,
  currencyCode = "USD",
  canEdit = false,
  onEdit,
  onClone,
  triggerButtonProps,
  tooltip,
}: ProviderDetailsDialogProps) {
  const [open, setOpen] = useState(false);
  const [trendData, setTrendData] = useState<ProviderUsageTrendPoint[]>([]);
  const [trendLoaded, setTrendLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const typeConfig = getProviderTypeConfig(provider.providerType);
  const costMultiplier = useMemo(() => {
    const numeric = Number(provider.costMultiplier ?? 0);
    return Number.isNaN(numeric) ? 0 : numeric;
  }, [provider.costMultiplier]);

  const healthInfo = useMemo(() => {
    if (!health) {
      return {
        label: "未知",
        className: "bg-muted text-muted-foreground border-border",
      };
    }
    return healthStyles[health.circuitState] ?? {
      label: "未知",
      className: "bg-muted text-muted-foreground border-border",
    };
  }, [health]);

  const todayCost = provider.todayTotalCostUsd
    ? formatCurrency(Number(provider.todayTotalCostUsd), currencyCode)
    : formatCurrency(0, currencyCode);
  const todayCalls = provider.todayCallCount ? `${provider.todayCallCount} 次` : "0 次";

  const handleAction = (callback?: () => void) => {
    if (!callback) return;
    setOpen(false);
    requestAnimationFrame(() => callback());
  };

  const fetchTrend = useCallback(async () => {
    setLoading(true);
    const result = await getProviderUsageTrend(provider.id, 14);
    if (!result.ok) {
      toast.error(result.error || "获取趋势失败");
      setLoading(false);
      return;
    }
    setTrendData(result.data ?? []);
    setTrendLoaded(true);
    setLoading(false);
  }, [provider.id]);

  useEffect(() => {
    if (!open) return;
    if (!trendLoaded && !loading) {
      fetchTrend().catch((error) => {
        console.error("获取供应商趋势失败", error);
      });
    }
  }, [open, fetchTrend, trendLoaded, loading]);

  // 计算14天统计数据
  const stats = useMemo(() => {
    const data = trendData ?? [];
    const totalCost = data.reduce((sum, point) => sum + Number(point.totalCostUsd ?? 0), 0);
    const totalCalls = data.reduce((sum, point) => sum + Number(point.callCount ?? 0), 0);
    const daysWithData = data.filter((point) => Number(point.callCount ?? 0) > 0).length;
    const avgCost = daysWithData > 0 ? totalCost / daysWithData : 0;
    const avgCalls = daysWithData > 0 ? totalCalls / daysWithData : 0;

    return {
      totalCost: formatCurrency(totalCost, currencyCode),
      totalCalls: totalCalls.toLocaleString(),
      avgCost: formatCurrency(avgCost, currencyCode),
      avgCalls: avgCalls.toFixed(2),
      daysWithData,
    };
  }, [trendData, currencyCode]);

  const triggerButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="查看供应商详情"
      {...triggerButtonProps}
    >
      {triggerButtonProps?.children ?? <Eye className="h-4 w-4" />}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>{triggerButton}</DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        <DialogTrigger asChild>{triggerButton}</DialogTrigger>
      )}
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Info className="h-4 w-4 text-primary" />供应商详情
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* 供应商基本信息卡片 */}
          <section className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-white via-slate-50/50 to-white p-6 shadow-md dark:from-slate-900 dark:via-slate-800/50 dark:to-slate-900">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-bold tracking-tight">{provider.name}</h2>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-xs font-semibold shadow-sm",
                      typeConfig.bgColor,
                      typeConfig.iconColor
                    )}
                  >
                    {typeConfig.label}
                  </Badge>
                  {provider.groupTag && (
                    <Badge variant="outline" className="text-xs shadow-sm">
                      {provider.groupTag}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground break-all max-w-2xl">
                  <span className="font-medium">URL：</span>
                  {provider.url}
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">授权密钥：</span>
                  <span className="font-mono tracking-wide">{provider.maskedKey}</span>
                </p>
              </div>
              <div className="flex gap-3">
                <div className="rounded-2xl border border-border/40 bg-gradient-to-br from-blue-50 to-blue-100/50 px-5 py-3 shadow-md dark:from-blue-950/50 dark:to-blue-900/30">
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-300">今日费用</p>
                  <p className="text-2xl font-bold tracking-tight text-blue-900 dark:text-blue-100">
                    {todayCost}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/40 bg-gradient-to-br from-orange-50 to-orange-100/50 px-5 py-3 shadow-md dark:from-orange-950/50 dark:to-orange-900/30">
                  <p className="text-xs font-medium text-orange-700 dark:text-orange-300">今日请求</p>
                  <p className="text-2xl font-bold tracking-tight text-orange-900 dark:text-orange-100">
                    {todayCalls}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("text-xs shadow-sm", healthInfo.className)}>
                {healthInfo.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                最近调用：{formatDateTime(provider.lastCallTime)} · 模型：
                {provider.lastCallModel ?? "未知"}
              </span>
            </div>
          </section>

          {/* 14天统计小卡片 */}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {/* 14天总费用 */}
            <div className="relative overflow-hidden rounded-xl border border-border/40 bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-4 shadow-sm dark:from-emerald-950/30 dark:to-emerald-900/20">
              <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-emerald-500/10" />
              <div className="relative space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">14天总费用</p>
                  <p className="text-xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
                    {stats.totalCost}
                  </p>
                  <p className="text-[10px] text-muted-foreground">累计成本</p>
                </div>
              </div>
            </div>

            {/* 14天总请求 */}
            <div className="relative overflow-hidden rounded-xl border border-border/40 bg-gradient-to-br from-blue-50 to-blue-100/50 p-4 shadow-sm dark:from-blue-950/30 dark:to-blue-900/20">
              <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-blue-500/10" />
              <div className="relative space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 text-blue-600 dark:text-blue-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">14天总请求</p>
                  <p className="text-xl font-bold tracking-tight text-blue-700 dark:text-blue-400">
                    {stats.totalCalls}
                  </p>
                  <p className="text-[10px] text-muted-foreground">调用次数</p>
                </div>
              </div>
            </div>

            {/* 日均费用 */}
            <div className="relative overflow-hidden rounded-xl border border-border/40 bg-gradient-to-br from-purple-50 to-purple-100/50 p-4 shadow-sm dark:from-purple-950/30 dark:to-purple-900/20">
              <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-purple-500/10" />
              <div className="relative space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/15">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 text-purple-600 dark:text-purple-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
                      />
                    </svg>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">日均费用</p>
                  <p className="text-xl font-bold tracking-tight text-purple-700 dark:text-purple-400">
                    {stats.avgCost}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    基于 {stats.daysWithData} 天实际使用
                  </p>
                </div>
              </div>
            </div>

            {/* 日均请求 */}
            <div className="relative overflow-hidden rounded-xl border border-border/40 bg-gradient-to-br from-orange-50 to-orange-100/50 p-4 shadow-sm dark:from-orange-950/30 dark:to-orange-900/20">
              <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-orange-500/10" />
              <div className="relative space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/15">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 text-orange-600 dark:text-orange-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">日均请求</p>
                  <p className="text-xl font-bold tracking-tight text-orange-700 dark:text-orange-400">
                    {stats.avgCalls}
                  </p>
                  <p className="text-[10px] text-muted-foreground">平均每日调用</p>
                </div>
              </div>
            </div>
          </section>

          {/* 14天用量趋势 */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold tracking-tight">14天费用与请求趋势</h3>
                <p className="text-xs text-muted-foreground">
                  追踪费用与请求走势，辅助判定波动原因
                </p>
              </div>
            </div>
            <ProviderUsageChart data={trendData} currencyCode={currencyCode} loading={loading} />
            <p className="text-xs text-muted-foreground">
              最后刷新时间：{formatDateTime(new Date().toISOString())}
            </p>
          </section>

          {/* 双栏布局：调度配置 + 今日概览 */}
          <section className="grid gap-4 lg:grid-cols-2">
            {/* 调度配置卡片 */}
            <div className="rounded-2xl border border-border/40 bg-gradient-to-br from-purple-50/50 via-white to-purple-50/30 p-5 shadow-md dark:from-purple-950/20 dark:via-slate-900 dark:to-purple-950/10">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 text-purple-600 dark:text-purple-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold">调度配置</h4>
                  <p className="text-xs text-muted-foreground">影响优先级、权重与池配置</p>
                </div>
              </div>
              <div className="space-y-2.5">
                <InfoRow label="优先级" value={`第 ${provider.priority} 层`} />
                <InfoRow label="权重" value={`${provider.weight}`} />
                <InfoRow label="成本倍率" value={`${costMultiplier.toFixed(2)}x`} />
                <InfoRow label="加入 Claude 池" value={provider.joinClaudePool ? "是" : "否"} />
                <InfoRow label="类型策略" value={typeConfig.description} />
                <InfoRow label="分组标签" value={provider.groupTag ?? "未分组"} />
              </div>
            </div>

            {/* 今日概览卡片 */}
            <div className="rounded-2xl border border-border/40 bg-gradient-to-br from-emerald-50/50 via-white to-emerald-50/30 p-5 shadow-md dark:from-emerald-950/20 dark:via-slate-900 dark:to-emerald-950/10">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold">今日概览</h4>
                  <p className="text-xs text-muted-foreground">实时数据统计</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">费用</span>
                  <span className="text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
                    {todayCost}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">请求数</span>
                  <span className="text-2xl font-bold tracking-tight text-blue-700 dark:text-blue-400">
                    {todayCalls}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">状态</span>
                  <Badge variant="outline" className={cn("text-xs", healthInfo.className)}>
                    {healthInfo.label}
                  </Badge>
                </div>
              </div>
            </div>
          </section>

          <Separator className="my-2" />
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <div>
              <div>创建时间：{provider.createdAt}</div>
              <div>最近更新：{provider.updatedAt}</div>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAction(onClone)}
                  className="shadow-sm"
                >
                  克隆供应商
                </Button>
                <Button size="sm" onClick={() => handleAction(onEdit)} className="shadow-sm">
                  编辑供应商
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface InfoRowProps {
  label: string;
  value: ReactNode;
}

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right break-all">{value ?? "-"}</span>
    </div>
  );
}

export default ProviderDetailsDialog;
