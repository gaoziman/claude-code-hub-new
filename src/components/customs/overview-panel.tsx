"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  Activity,
  TrendingUp,
  DollarSign,
  Clock,
  User,
  Key,
  Cpu,
  CheckCircle,
  XCircle,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Server,
  Users as UsersIcon,
  ArrowRight,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getOverviewData } from "@/actions/overview";
import { formatCurrency } from "@/lib/utils/currency";
import { cn, formatTokenAmount } from "@/lib/utils";
import type { OverviewData } from "@/actions/overview";
import type { ActiveSessionInfo } from "@/types/session";
import type { CurrencyCode } from "@/lib/utils";

const REFRESH_INTERVAL = 5000; // 5秒刷新一次

async function fetchOverviewData(): Promise<OverviewData> {
  const result = await getOverviewData();
  if (!result.ok) {
    throw new Error(result.error || "获取概览数据失败");
  }
  return result.data;
}

/**
 * 格式化重置时间显示
 */
function formatResetTime(resetAt: Date | undefined, resetType: "natural" | "rolling" | undefined): string | null {
  if (!resetAt) return null;

  if (resetType === "natural") {
    // 自然周期：显示绝对时间 + 相对时间
    const absoluteTime = format(resetAt, "M月d日(E) HH:mm", { locale: zhCN });
    const relativeTime = formatDistanceToNow(resetAt, { locale: zhCN, addSuffix: true });
    return `将于 ${absoluteTime} 重置 (${relativeTime})`;
  }

  return null;
}

/**
 * 格式化持续时长
 */
function formatDuration(durationMs: number | undefined): string {
  if (!durationMs) return "-";

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  } else if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * 获取状态图标和颜色
 */
function getStatusIcon(status: "in_progress" | "completed" | "error", statusCode?: number) {
  if (status === "in_progress") {
    return { icon: Loader2, className: "text-blue-500 animate-spin" };
  } else if (status === "error" || (statusCode && statusCode >= 400)) {
    return { icon: XCircle, className: "text-red-500" };
  } else {
    return { icon: CheckCircle, className: "text-green-500" };
  }
}

/**
 * 简洁的 Session 列表项
 */
function SessionListItem({
  session,
  currencyCode = "USD",
}: {
  session: ActiveSessionInfo;
  currencyCode?: CurrencyCode;
}) {
  const statusInfo = getStatusIcon(session.status, session.statusCode);
  const StatusIcon = statusInfo.icon;
  const inputTokensDisplay =
    session.inputTokens !== undefined ? formatTokenAmount(session.inputTokens) : null;
  const outputTokensDisplay =
    session.outputTokens !== undefined ? formatTokenAmount(session.outputTokens) : null;

  return (
    <Link
      href={`/dashboard/sessions/${session.sessionId}/messages`}
      className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-muted/60"
    >
      <StatusIcon className={cn("h-3.5 w-3.5 flex-shrink-0", statusInfo.className)} />
      <div className="flex items-center gap-1.5 min-w-0 text-sm">
        <User className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        <span className="truncate font-medium max-w-[120px]" title={session.userName}>
          {session.userName}
        </span>
      </div>
      <div className="flex items-center gap-1 min-w-0 text-xs text-muted-foreground">
        <Key className="h-3 w-3 flex-shrink-0" />
        <span className="truncate font-mono max-w-[80px]" title={session.keyName}>
          {session.keyName}
        </span>
      </div>
      <div className="hidden md:flex items-center gap-1 min-w-0 text-xs text-muted-foreground">
        <Cpu className="h-3 w-3 flex-shrink-0" />
        <span className="truncate font-mono max-w-[140px]" title={session.model ?? undefined}>
          {session.model || "未知模型"}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
        <span>{formatDuration(session.durationMs ?? undefined)}</span>
        {(inputTokensDisplay || outputTokensDisplay) && (
          <span className="font-mono">
            {inputTokensDisplay}
            {outputTokensDisplay ? ` / ${outputTokensDisplay}` : ""}
          </span>
        )}
        {session.costUsd && (
          <span className="font-semibold text-foreground">
            {formatCurrency(session.costUsd, currencyCode, 4)}
          </span>
        )}
      </div>
    </Link>
  );
}

function getLimitVisualState(used: number, limit: number) {
  if (!limit || limit <= 0) {
    return {
      ratio: 0,
      textClass: "text-muted-foreground",
      progressClass: "",
    };
  }

  const ratio = Math.min(used / limit, 1);
  if (ratio >= 1) {
    return {
      ratio,
      textClass: "text-destructive",
      progressClass: "[&_[data-slot=progress-indicator]]:bg-destructive",
    };
  }

  if (ratio >= 0.7) {
    return {
      ratio,
      textClass: "text-amber-500",
      progressClass: "[&_[data-slot=progress-indicator]]:bg-amber-500",
    };
  }

  return {
    ratio,
    textClass: "text-primary",
    progressClass: "",
  };
}

function KpiCard({
  title,
  value,
  description,
  icon: Icon,
  loading,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}) {
  return (
    <Card className="rounded-2xl border border-border/60 bg-gradient-to-br from-card to-card/60 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-semibold tracking-tight">
              {loading ? (
                <span className="block h-6 w-24 rounded-full bg-muted animate-pulse" />
              ) : (
                value
              )}
            </p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <div className="rounded-2xl bg-muted/40 p-3">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SystemHealthBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <Badge
      variant={active ? "secondary" : "outline"}
      className={cn(
        "rounded-full px-3 py-1 text-xs",
        active ? "text-green-700 dark:text-green-300" : "text-muted-foreground"
      )}
    >
      {label}
    </Badge>
  );
}

interface OverviewPanelProps {
  currencyCode?: CurrencyCode;
}

export function OverviewPanel({ currencyCode = "USD" }: OverviewPanelProps) {
  const router = useRouter();

  const { data, isLoading } = useQuery<OverviewData, Error>({
    queryKey: ["overview-data"],
    queryFn: fetchOverviewData,
    refetchInterval: REFRESH_INTERVAL,
  });

  const metrics = data || {
    concurrentSessions: 0,
    todayRequests: 0,
    todayCost: 0,
    avgResponseTime: 0,
    recentSessions: [],
    role: "user" as const,
    allowGlobalUsageView: false,
    systemHealth: {
      notificationsEnabled: false,
      autoCleanupEnabled: false,
      allowGlobalUsageView: false,
    },
  };

  const kpis = [
    {
      title: "当前并发",
      value: metrics.concurrentSessions.toLocaleString(),
      description: "最近 5 分钟",
      icon: Activity,
    },
    {
      title: "今日请求",
      value: metrics.todayRequests.toLocaleString(),
      description: "API 调用次数",
      icon: TrendingUp,
    },
    {
      title: "今日消耗",
      value: formatCurrency(metrics.todayCost, currencyCode),
      description: `以 ${currencyCode} 计价`,
      icon: DollarSign,
    },
    {
      title: "平均响应",
      value: formatDuration(metrics.avgResponseTime),
      description: "响应时间",
      icon: Clock,
    },
  ];

  const showGlobalInsights =
    metrics.role === "admin" || Boolean(data?.topUsers?.length || data?.topProviders?.length);
  const personalSummary = data?.personalSummary;
  const shouldShowPersonalSummary = !showGlobalInsights && metrics.role !== "admin";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <KpiCard key={item.title} {...item} loading={isLoading} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          className={cn(
            "rounded-2xl border border-border/60",
            metrics.role === "admin" ? "xl:col-span-2" : "xl:col-span-3"
          )}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-semibold">实时活跃 Session</CardTitle>
              <span className="text-xs text-muted-foreground">
                {metrics.recentSessions.length} 个活跃
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => router.push("/dashboard/sessions")}
            >
              查看全部
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="max-h-[260px] overflow-y-auto">
            {isLoading && metrics.recentSessions.length === 0 ? (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 实时加载中...
              </div>
            ) : metrics.recentSessions.length === 0 ? (
              <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                暂无活跃 Session
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {metrics.recentSessions.map((session) => (
                  <SessionListItem
                    key={session.sessionId}
                    session={session}
                    currencyCode={currencyCode}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {metrics.role === "admin" && (
          <Card className="rounded-2xl border border-border/60">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <CardTitle className="text-base font-semibold">系统状态</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">快速了解通知、自动清理等系统开关</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <SystemHealthBadge
                  label={
                    metrics.systemHealth.notificationsEnabled ? "通知推送已启用" : "通知推送关闭"
                  }
                  active={metrics.systemHealth.notificationsEnabled}
                />
                <SystemHealthBadge
                  label={
                    metrics.systemHealth.autoCleanupEnabled
                      ? "日志自动清理开启"
                      : "日志自动清理关闭"
                  }
                  active={metrics.systemHealth.autoCleanupEnabled}
                />
                <SystemHealthBadge
                  label={
                    metrics.systemHealth.allowGlobalUsageView
                      ? "全站视图对用户开放"
                      : "仅限个人视图"
                  }
                  active={metrics.systemHealth.allowGlobalUsageView}
                />
              </div>
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
                - 管理员可在“系统设置 - 配置”中调整数据可见范围。
                <br />- 如需开启企业微信告警，请在“消息推送”中配置。
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {showGlobalInsights && (
          <>
            <Card className="rounded-2xl border border-border/60">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <UsersIcon className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base font-semibold">Top 用户（今日）</CardTitle>
                </div>
                <p className="text-xs text-muted-foreground">按消耗金额排序的前三名</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {data?.topUsers?.length ? (
                  data.topUsers.map((user, index) => (
                    <div
                      key={user.userId}
                      className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-semibold">
                          {index + 1}. {user.userName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {user.totalRequests.toLocaleString()} 次请求
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-primary">
                        {formatCurrency(user.totalCost, currencyCode)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">暂无数据</p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border border-border/60">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base font-semibold">Top 供应商（今日）</CardTitle>
                </div>
                <p className="text-xs text-muted-foreground">按成本排序，包含成功率</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {data?.topProviders?.length ? (
                  data.topProviders.map((provider) => (
                    <div key={provider.providerId} className="space-y-1">
                      <div className="flex items-center justify-between text-sm font-medium">
                        <span>{provider.providerName}</span>
                        <span>{formatCurrency(provider.totalCost, currencyCode)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{provider.totalRequests.toLocaleString()} 次请求</span>
                        <span>成功率 {provider.successRate}%</span>
                      </div>
                      <Progress value={provider.successRate} className="h-1.5" />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">暂无供应商数据</p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border border-border/60">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base font-semibold">近期异常</CardTitle>
                </div>
                <p className="text-xs text-muted-foreground">统计近 6 小时内的错误请求</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {data?.recentErrors?.length ? (
                  data.recentErrors.map((error, index) => (
                    <div
                      key={`${error.providerId}-${error.statusCode}-${index}`}
                      className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-semibold">{error.providerName ?? "未知供应商"}</p>
                        <p className="text-xs text-muted-foreground">
                          {error.statusCode ?? "--"} 状态码
                        </p>
                      </div>
                      <Badge variant="destructive">{error.count} 次</Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">最近没有检测到错误</p>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {shouldShowPersonalSummary && (
          <Card className="rounded-2xl border border-border/60 xl:col-span-3">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <UsersIcon className="h-4 w-4 text-primary" />
                <CardTitle className="text-base font-semibold">我的使用概览</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">今日配额使用情况与常用偏好</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">今日消耗</p>
                  <p className="text-2xl font-semibold text-primary">
                    {formatCurrency(personalSummary?.todayCost ?? 0, currencyCode)}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  今日调用次数：
                  <span className="font-semibold text-foreground">
                    {personalSummary?.todayRequests ?? 0}
                  </span>
                </div>
              </div>

              {/* 用户级别额度 */}
              {personalSummary?.userSpendingLimits && personalSummary.userSpendingLimits.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-semibold">用户级别额度</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">该限额适用于您所有 Key 的总消费</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {personalSummary.userSpendingLimits.map((limitItem) => {
                      const state = getLimitVisualState(limitItem.used, limitItem.limit);
                      const percent = limitItem.limit
                        ? Math.min(100, (limitItem.used / limitItem.limit) * 100)
                        : 0;

                      const resetTimeText = formatResetTime(limitItem.resetAt, limitItem.resetType);

                      return (
                        <div
                          key={`user-${limitItem.key}`}
                          className="rounded-xl border border-blue-200/60 bg-blue-50/30 p-3 text-xs"
                        >
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span>{limitItem.label}</span>
                            <span className={cn("font-semibold", state.textClass)}>
                              {(state.ratio * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="mt-1 flex items-baseline justify-between gap-2 text-sm">
                            <span className="font-semibold text-foreground">
                              {formatCurrency(limitItem.used, currencyCode)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              / {formatCurrency(limitItem.limit, currencyCode)}
                            </span>
                          </div>
                          <Progress
                            value={percent}
                            className={cn("mt-2 h-1.5", state.progressClass)}
                          />
                          {resetTimeText && (
                            <div className="mt-2 text-[10px] text-muted-foreground">
                              {resetTimeText}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Key级别额度 */}
              {personalSummary?.keySpendingLimits && personalSummary.keySpendingLimits.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-semibold">
                      当前 Key 额度 ({personalSummary.currentKeyName})
                    </span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">该限额仅适用于当前 Key 的独立消费</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {personalSummary.keySpendingLimits.map((limitItem) => {
                      const state = getLimitVisualState(limitItem.used, limitItem.limit);
                      const percent = limitItem.limit
                        ? Math.min(100, (limitItem.used / limitItem.limit) * 100)
                        : 0;

                      const resetTimeText = formatResetTime(limitItem.resetAt, limitItem.resetType);

                      return (
                        <div
                          key={`key-${limitItem.key}`}
                          className="rounded-xl border border-green-200/60 bg-green-50/30 p-3 text-xs"
                        >
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span>{limitItem.label}</span>
                            <span className={cn("font-semibold", state.textClass)}>
                              {(state.ratio * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="mt-1 flex items-baseline justify-between gap-2 text-sm">
                            <span className="font-semibold text-foreground">
                              {formatCurrency(limitItem.used, currencyCode)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              / {formatCurrency(limitItem.limit, currencyCode)}
                            </span>
                          </div>
                          <Progress
                            value={percent}
                            className={cn("mt-2 h-1.5", state.progressClass)}
                          />
                          {resetTimeText && (
                            <div className="mt-2 text-[10px] text-muted-foreground">
                              {resetTimeText}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 无限额提示 */}
              {(!personalSummary?.userSpendingLimits || personalSummary.userSpendingLimits.length === 0) &&
               (!personalSummary?.keySpendingLimits || personalSummary.keySpendingLimits.length === 0) && (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">未设置限额</p>
                  <p>用户级别和当前 Key 均未配置消费限额（5小时/周/月/累计）。</p>
                  <p className="mt-2">
                    💡 建议在「用户管理」中配置限额，以便更好地控制 API 成本。
                  </p>
                </div>
              )}

              <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                常用供应商：
                <span className="font-semibold text-foreground">
                  {personalSummary?.favoriteProvider ?? "暂无数据"}
                </span>
                <br />
                常用模型：
                <span className="font-semibold text-foreground">
                  {personalSummary?.favoriteModel ?? "暂无数据"}
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
