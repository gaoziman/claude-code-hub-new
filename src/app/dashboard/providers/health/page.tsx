import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProviderHealthReport } from "@/repository/provider-health";
import type { ProviderHealthScore } from "@/repository/provider-health";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Activity, Gauge, RefreshCw, ShieldAlert, TimerReset, TrendingUp } from "lucide-react";

const WINDOW_OPTIONS = [
  { label: "1 小时", value: 1 },
  { label: "6 小时", value: 6 },
  { label: "24 小时", value: 24 },
  { label: "3 天", value: 72 },
];

const SORT_OPTIONS = [
  { label: "健康指数", value: "score" },
  { label: "成功率", value: "success" },
  { label: "P95 延迟", value: "latency" },
  { label: "请求量", value: "requests" },
];

const PROVIDER_TABLE_SECTION_ID = "providers-table";

function formatPercent(value: number, fractionDigits = 1) {
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

function formatLatency(value: number | null) {
  if (value === null || Number.isNaN(value)) return "--";
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${Math.round(value)}ms`;
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "--";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toString();
}

function sortProviders<
  T extends {
    healthScore: number;
    successRate: number;
    p95LatencyMs: number | null;
    totalRequests: number;
  },
>(providers: T[], sortKey: string) {
  const sorted = [...providers];
  switch (sortKey) {
    case "success":
      sorted.sort((a, b) => b.successRate - a.successRate);
      break;
    case "latency":
      sorted.sort((a, b) => {
        const aValue = a.p95LatencyMs ?? Number.POSITIVE_INFINITY;
        const bValue = b.p95LatencyMs ?? Number.POSITIVE_INFINITY;
        return aValue - bValue;
      });
      break;
    case "requests":
      sorted.sort((a, b) => b.totalRequests - a.totalRequests);
      break;
    case "score":
    default:
      sorted.sort((a, b) => b.healthScore - a.healthScore);
      break;
  }
  return sorted;
}

function getHealthLevel(score: number) {
  if (score >= 80) {
    return {
      label: "优秀",
      badgeClass: "bg-emerald-100 text-emerald-700",
      chipClass: "bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 text-emerald-700",
    };
  }
  if (score >= 60) {
    return {
      label: "良好",
      badgeClass: "bg-amber-100 text-amber-700",
      chipClass: "bg-gradient-to-r from-amber-500/10 to-amber-500/5 text-amber-700",
    };
  }
  return {
    label: "需关注",
    badgeClass: "bg-rose-100 text-rose-700",
    chipClass: "bg-gradient-to-r from-rose-500/10 to-rose-500/5 text-rose-700",
  };
}

interface StatCardProps {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  accent?: string;
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  accent = "bg-slate-100 text-slate-700",
}: StatCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-border/40 bg-gradient-to-br from-white to-slate-50/30 p-4 shadow-sm transition-all hover:border-border hover:shadow-md dark:from-slate-900 dark:to-slate-800/30">
      {/* 背景装饰 */}
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br from-emerald-500/5 to-blue-500/5 blur-2xl transition-opacity group-hover:opacity-100 opacity-70" />

      <div className="relative flex items-start gap-4">
        {/* 图标 */}
        <div className={cn("flex-shrink-0 rounded-md p-2.5 shadow-sm transition-transform group-hover:scale-105", accent)}>
          <Icon className="h-5 w-5" />
        </div>

        {/* 内容 */}
        <div className="flex-1 space-y-1 overflow-hidden">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

interface ProviderListCardProps {
  title: string;
  subtitle: string;
  items: ProviderHealthScore[];
  emptyText: string;
  badgeTone: "positive" | "negative";
  sortKey?: string;
  windowParam?: number;
}

function ProviderListCard({
  title,
  subtitle,
  items,
  emptyText,
  badgeTone,
  sortKey,
  windowParam,
}: ProviderListCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-border/40 bg-gradient-to-br from-white via-white to-slate-50/30 p-6 shadow-md transition-all hover:shadow-xl dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/30">
      {/* 背景装饰 */}
      <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br from-blue-500/5 to-emerald-500/5 blur-3xl" />

      <div className="relative space-y-5">
        {/* 头部 */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {sortKey && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 rounded-xl text-xs text-muted-foreground hover:bg-white/80 hover:text-foreground dark:hover:bg-slate-800/80"
              asChild
            >
              <Link
                href={`/dashboard/providers/health?window=${windowParam ?? 6}&sort=${sortKey}#${PROVIDER_TABLE_SECTION_ID}`}
              >
                查看全部 →
              </Link>
            </Button>
          )}
        </div>

        {/* 供应商列表 */}
        <div className="space-y-3">
          {items.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border/50 bg-muted/20">
              <p className="text-sm text-muted-foreground">{emptyText}</p>
            </div>
          ) : (
            items.map((provider, index) => {
              const healthTone = getHealthLevel(provider.healthScore);
              return (
                <div
                  key={`${provider.providerId}-${badgeTone}`}
                  className="group/item relative overflow-hidden rounded-lg border border-border/40 bg-white/90 p-4 transition-all hover:border-border hover:shadow-md dark:bg-slate-800/90"
                >
                  {/* Hover 装饰 */}
                  <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-gradient-to-br from-emerald-500/0 to-blue-500/0 blur-2xl transition-all group-hover/item:from-emerald-500/10 group-hover/item:to-blue-500/10" />

                  <div className="relative flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {/* 排名徽章 */}
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-md text-sm font-bold shadow-sm transition-all group-hover/item:scale-110",
                          badgeTone === "positive"
                            ? "bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-700 dark:from-emerald-900/50 dark:to-emerald-800/30 dark:text-emerald-400"
                            : "bg-gradient-to-br from-rose-100 to-rose-50 text-rose-700 dark:from-rose-900/50 dark:to-rose-800/30 dark:text-rose-400"
                        )}
                      >
                        {index + 1}
                      </div>

                      {/* 供应商信息 */}
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground">{provider.providerName}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <div className="h-1 w-1 rounded-full bg-emerald-500" />
                            <span>成功率 {formatPercent(provider.successRate)}</span>
                          </div>
                          <span>·</span>
                          <div className="flex items-center gap-1">
                            <div className="h-1 w-1 rounded-full bg-blue-500" />
                            <span>P95 {formatLatency(provider.p95LatencyMs)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 健康评分 */}
                    <div
                      className={cn(
                        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-bold shadow-sm",
                        badgeTone === "positive"
                          ? "bg-gradient-to-r from-emerald-50 to-emerald-100/50 text-emerald-700 dark:from-emerald-900/30 dark:to-emerald-800/20 dark:text-emerald-400"
                          : "bg-gradient-to-r from-rose-50 to-rose-100/50 text-rose-700 dark:from-rose-900/30 dark:to-rose-800/20 dark:text-rose-400"
                      )}
                    >
                      <span>{provider.healthScore.toFixed(1)}</span>
                      <span className="text-[10px] opacity-70">· {healthTone.label}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function InlineProgress({
  value,
  tone = "emerald",
}: {
  value: number;
  tone?: "emerald" | "slate";
}) {
  const safeValue = Math.min(Math.max(value, 0), 100);
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/40">
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full transition-all",
          tone === "emerald"
            ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
            : "bg-gradient-to-r from-slate-500 to-slate-400"
        )}
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}

interface ProvidersHealthPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ProvidersHealthPage({ searchParams }: ProvidersHealthPageProps) {
  const session = await getSession();
  if (!session || session.user.role !== "admin") {
    redirect("/dashboard");
  }

  const resolvedParams = await searchParams;

  const windowParam = Array.isArray(resolvedParams.window)
    ? resolvedParams.window[0]
    : resolvedParams.window;
  const sortParam = Array.isArray(resolvedParams.sort)
    ? resolvedParams.sort[0]
    : resolvedParams.sort;

  const windowHoursRaw = Number(windowParam);
  const windowHours = Number.isNaN(windowHoursRaw) ? undefined : windowHoursRaw;
  const sortKey = sortParam || "score";

  const report = await getProviderHealthReport({ windowHours });
  const providers = sortProviders(report.providers, sortKey);

  const averageHealthScore =
    providers.length > 0
      ? providers.reduce((sum, provider) => sum + provider.healthScore, 0) / providers.length
      : 0;
  const totalCircuitEvents = providers.reduce((sum, provider) => sum + provider.circuitEvents, 0);
  const healthLevel = getHealthLevel(averageHealthScore);
  const bestProviders = providers.slice(0, 3);
  const attentionProviders = [...providers]
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, 3);
  const latencyLeaders = providers
    .filter((provider) => provider.p95LatencyMs !== null)
    .sort((a, b) => (a.p95LatencyMs ?? 0) - (b.p95LatencyMs ?? 0))
    .slice(0, 3);

  const averageMetrics = providers.reduce(
    (acc, provider) => {
      acc.success += provider.metrics.successScore;
      acc.latency += provider.metrics.latencyScore;
      acc.circuit += provider.metrics.circuitScore;
      acc.cost += provider.metrics.costScore;
      return acc;
    },
    { success: 0, latency: 0, circuit: 0, cost: 0 }
  );

  const normalizedMetrics =
    providers.length > 0
      ? {
          success: averageMetrics.success / providers.length,
          latency: averageMetrics.latency / providers.length,
          circuit: averageMetrics.circuit / providers.length,
          cost: averageMetrics.cost / providers.length,
        }
      : { success: 0, latency: 0, circuit: 0, cost: 0 };

  const summaryCards = [
    {
      title: "平均成功率",
      value: formatPercent(report.summary.averageSuccessRate),
      description: `覆盖 ${report.summary.providerCount} 个供应商`,
      icon: TrendingUp,
      accent: "bg-emerald-100 text-emerald-700",
    },
    {
      title: "平均 P95 延迟",
      value: report.summary.averageP95Latency
        ? formatLatency(report.summary.averageP95Latency)
        : "--",
      description: "高峰期响应速度",
      icon: TimerReset,
      accent: "bg-sky-100 text-sky-700",
    },
    {
      title: "请求总量",
      value: formatNumber(report.summary.totalRequests),
      description: `窗口共 ${report.summary.totalRequests.toLocaleString()} 次调用`,
      icon: Activity,
      accent: "bg-blue-100 text-blue-700",
    },
    {
      title: "熔断事件",
      value: totalCircuitEvents.toLocaleString(),
      description: "越少越稳定",
      icon: ShieldAlert,
      accent: "bg-rose-100 text-rose-700",
    },
  ];

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-6 py-8">
      {/* 顶部总览区域 - 玻璃拟态设计 */}
      <section className="relative overflow-hidden rounded-lg border border-border/40 bg-gradient-to-br from-white via-emerald-50/50 to-blue-50/30 p-5 shadow-md backdrop-blur-sm dark:from-slate-900 dark:via-emerald-950/30 dark:to-blue-950/20">
        {/* 背景装饰圆圈 */}
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* 左侧：核心指标展示 */}
          <div className="flex items-center gap-4 lg:w-2/5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm backdrop-blur-sm dark:bg-slate-800/90 dark:text-emerald-400">
                  <Gauge className="h-3.5 w-3.5" />
                  健康洞察 · {report.windowHours}h 窗口
                </div>
                <Badge
                  variant="secondary"
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    healthLevel.badgeClass
                  )}
                >
                  {healthLevel.label}
                </Badge>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  平均健康指数
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <p className="text-4xl font-bold tracking-tight text-foreground">
                    {averageHealthScore.toFixed(1)}
                  </p>
                  <span className="text-sm text-muted-foreground">/ 100</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="h-1 w-1 rounded-full bg-emerald-500" />
                  <span>最近生成：{report.generatedAt.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-1 w-1 rounded-full bg-blue-500" />
                  <span>{report.summary.providerCount} 个供应商</span>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧：时间窗口选择和快速统计 */}
          <div className="space-y-3 lg:w-3/5">
            {/* 时间窗口选择器 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">时间范围</span>
              {WINDOW_OPTIONS.map((option) => (
                <Link
                  key={option.value}
                  href={`/dashboard/providers/health?window=${option.value}&sort=${sortKey}`}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs transition-all hover:scale-105",
                    report.windowHours === option.value
                      ? "border-transparent bg-gradient-to-r from-emerald-600 to-emerald-500 font-bold text-white shadow-md shadow-emerald-500/30 [text-shadow:_0_1px_2px_rgb(0_0_0_/_20%)]"
                      : "border-border/60 bg-white/80 font-medium text-muted-foreground backdrop-blur-sm hover:border-emerald-500/30 hover:bg-white hover:text-foreground dark:bg-slate-800/80"
                  )}
                >
                  {option.label}
                </Link>
              ))}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-white/80 hover:text-foreground dark:hover:bg-slate-800/80"
                asChild
              >
                <Link
                  href={`/dashboard/providers/health?window=${report.windowHours}&sort=${sortKey}`}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  刷新数据
                </Link>
              </Button>
            </div>

            {/* 快速统计网格 */}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-2">
              {[
                {
                  label: "覆盖供应商",
                  value: report.summary.providerCount.toString(),
                  hint: "参与评分账号",
                  gradient: "from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20",
                  iconColor: "text-purple-600 dark:text-purple-400",
                },
                {
                  label: "请求总量",
                  value: report.summary.totalRequests.toLocaleString(),
                  hint: "窗口内全部请求",
                  gradient: "from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20",
                  iconColor: "text-blue-600 dark:text-blue-400",
                },
                {
                  label: "平均成功率",
                  value: formatPercent(report.summary.averageSuccessRate),
                  hint: "整体稳定性",
                  gradient: "from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20",
                  iconColor: "text-emerald-600 dark:text-emerald-400",
                },
                {
                  label: "熔断事件",
                  value: totalCircuitEvents.toLocaleString(),
                  hint: "需重点监控",
                  gradient: "from-orange-50 to-orange-100/50 dark:from-orange-950/30 dark:to-orange-900/20",
                  iconColor: "text-orange-600 dark:text-orange-400",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className={cn(
                    "relative overflow-hidden rounded-md border border-border/40 bg-gradient-to-br p-3 shadow-sm backdrop-blur-sm",
                    stat.gradient
                  )}
                >
                  <div className="absolute -right-2 -top-2 h-12 w-12 rounded-full bg-white/30 blur-xl" />
                  <div className="relative space-y-0.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {stat.label}
                    </p>
                    <p className={cn("text-xl font-bold tracking-tight", stat.iconColor)}>
                      {stat.value}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{stat.hint}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </section>

      {/* 供应商排行榜 - 三列布局 */}
      <section className="grid gap-5 lg:grid-cols-3">
        {/* 表现最佳 */}
        <ProviderListCard
          title="🏆 表现最佳"
          subtitle="Top 3 健康度 ≥ 70"
          items={bestProviders}
          emptyText="暂无可用数据"
          badgeTone="positive"
          sortKey="score"
          windowParam={report.windowHours}
        />

        {/* 需要关注 */}
        <ProviderListCard
          title="⚠️ 需要关注"
          subtitle="健康度最低的三家供应商"
          items={attentionProviders}
          emptyText="暂无风险供应商"
          badgeTone="negative"
          sortKey="score"
          windowParam={report.windowHours}
        />

        {/* 延迟与稳定性剖析 */}
        <div className="group relative overflow-hidden rounded-lg border border-border/40 bg-gradient-to-br from-white via-white to-slate-50/30 p-6 shadow-md transition-all hover:shadow-xl dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/30">
          {/* 背景装饰 */}
          <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br from-purple-500/5 to-blue-500/5 blur-3xl" />

          <div className="relative space-y-5">
            {/* 头部 */}
            <div>
              <h3 className="text-lg font-bold tracking-tight text-foreground">📊 延迟与稳定性剖析</h3>
              <p className="text-sm text-muted-foreground">结合 P95 与得分评估整体体验</p>
            </div>

            {/* 指标进度条 */}
            <div className="space-y-4">
              {[
                {
                  label: "成功率",
                  value: normalizedMetrics.success,
                  icon: "🎯",
                },
                {
                  label: "响应延迟",
                  value: normalizedMetrics.latency,
                  icon: "⚡",
                },
                {
                  label: "熔断控制",
                  value: normalizedMetrics.circuit,
                  icon: "🛡️",
                },
                {
                  label: "成本稳定",
                  value: normalizedMetrics.cost,
                  icon: "💰",
                },
              ].map((metric) => (
                <div key={metric.label} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <span>{metric.icon}</span>
                      <span>{metric.label}</span>
                    </div>
                    <span className="text-sm font-bold text-foreground">{metric.value.toFixed(0)}%</span>
                  </div>
                  <InlineProgress value={metric.value} tone="emerald" />
                </div>
              ))}
            </div>

            {/* 延迟领先者 */}
            <div className="rounded-lg border border-dashed border-border/50 bg-gradient-to-br from-blue-50/50 to-purple-50/30 p-4 dark:from-blue-950/20 dark:to-purple-950/10">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">⚡ 延迟领先</span>
                <Badge variant="secondary" className="text-[10px]">
                  P95 最低
                </Badge>
              </div>
              {latencyLeaders.length === 0 ? (
                <div className="flex h-20 items-center justify-center rounded-md bg-muted/20">
                  <p className="text-xs text-muted-foreground">暂无有效延迟数据</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {latencyLeaders.map((provider, index) => (
                    <div
                      key={`latency-${provider.providerId}`}
                      className="flex items-center justify-between rounded-md bg-white/80 px-3 py-2 backdrop-blur-sm transition-all hover:bg-white dark:bg-slate-800/80 dark:hover:bg-slate-800"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-[10px] font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          {index + 1}
                        </div>
                        <span className="text-sm font-medium text-foreground">
                          {provider.providerName}
                        </span>
                      </div>
                      <span className="font-mono text-xs font-semibold text-muted-foreground">
                        {formatLatency(provider.p95LatencyMs)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 供应商详情表格 */}
      <section
        id={PROVIDER_TABLE_SECTION_ID}
        className="relative overflow-hidden rounded-lg border border-border/40 bg-gradient-to-br from-white via-white to-slate-50/20 p-8 shadow-lg backdrop-blur-sm dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/20"
      >
        {/* 背景装饰 */}
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-500/5 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-emerald-500/5 blur-3xl" />

        <div className="relative space-y-6">
          {/* 表格头部 */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">📋 供应商列表</h2>
              <p className="mt-1 text-sm text-muted-foreground">支持多维度排序，点击标签切换排序方式</p>
            </div>

            {/* 排序选择器 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">排序依据</span>
              {SORT_OPTIONS.map((option) => (
                <Link
                  key={option.value}
                  href={`/dashboard/providers/health?window=${report.windowHours}&sort=${option.value}#${PROVIDER_TABLE_SECTION_ID}`}
                  className={cn(
                    "rounded-lg border px-4 py-2 text-sm transition-all hover:scale-105",
                    sortKey === option.value
                      ? "border-transparent bg-gradient-to-r from-blue-600 to-blue-500 font-bold text-white shadow-lg shadow-blue-500/30 [text-shadow:_0_1px_2px_rgb(0_0_0_/_20%)]"
                      : "border-border/60 bg-white/80 font-medium text-muted-foreground backdrop-blur-sm hover:border-blue-500/30 hover:bg-white hover:text-foreground dark:bg-slate-800/80"
                  )}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>

          {/* 表格容器 */}
          <div className="overflow-hidden rounded-lg border border-border/40 bg-white/80 shadow-md backdrop-blur-sm dark:bg-slate-900/80">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/40 bg-gradient-to-r from-slate-50 to-slate-100/50 hover:bg-gradient-to-r dark:from-slate-800/50 dark:to-slate-700/30">
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    供应商
                  </TableHead>
                  <TableHead className="text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    请求量
                  </TableHead>
                  <TableHead className="text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    成功率
                  </TableHead>
                  <TableHead className="text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    P95 延迟
                  </TableHead>
                  <TableHead className="text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    熔断次数
                  </TableHead>
                  <TableHead className="text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    成本波动
                  </TableHead>
                  <TableHead className="text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    健康指数
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12">
                      <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                        <div className="rounded-lg bg-muted/20 p-4">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-12 w-12"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                            />
                          </svg>
                        </div>
                        <p className="text-sm font-medium">暂无数据</p>
                        <p className="text-xs">最近 {report.windowHours} 小时暂无请求数据</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {providers.map((provider) => {
                  const tone = getHealthLevel(provider.healthScore);
                  return (
                    <TableRow
                      key={provider.providerId}
                      className="border-b border-border/30 bg-white/60 transition-all hover:bg-white dark:bg-slate-900/60 dark:hover:bg-slate-900"
                    >
                      <TableCell className="py-4">
                        <div className="flex flex-col gap-2">
                          <span className="font-semibold text-foreground">{provider.providerName}</span>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge
                              variant="outline"
                              className="rounded-lg text-[11px] font-medium shadow-sm"
                            >
                              {provider.providerType}
                            </Badge>
                            {provider.groupTag && (
                              <Badge
                                variant="secondary"
                                className="rounded-lg text-[11px] font-medium shadow-sm"
                              >
                                {provider.groupTag}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 text-right">
                        <span className="font-mono text-sm font-medium text-muted-foreground">
                          {provider.totalRequests.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 text-right">
                        <div className="flex flex-col items-end gap-2">
                          <span className="font-mono text-sm font-semibold text-foreground">
                            {formatPercent(provider.successRate)}
                          </span>
                          <div className="w-24">
                            <InlineProgress value={provider.successRate * 100} tone="emerald" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 text-right">
                        <span className="font-mono text-sm font-medium text-muted-foreground">
                          {formatLatency(provider.p95LatencyMs)}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 text-right">
                        <span className="font-mono text-sm font-medium text-muted-foreground">
                          {provider.circuitEvents}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 text-right">
                        <span className="font-mono text-sm font-medium text-muted-foreground">
                          {provider.costStddev.toFixed(3)}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 text-right">
                        <div
                          className={cn(
                            "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-bold shadow-sm",
                            tone.badgeClass
                          )}
                        >
                          <span>{provider.healthScore.toFixed(1)}</span>
                          <span className="text-[10px] opacity-70">· {tone.label}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>
    </div>
  );
}
