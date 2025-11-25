import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProviderHealthReport } from "@/repository/provider-health";
import type { ProviderHealthScore } from "@/repository/provider-health";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Activity,
  Gauge,
  RefreshCw,
  ShieldAlert,
  TimerReset,
  TrendingUp,
  Zap,
  Target,
  BarChart3,
  AlertTriangle,
} from "lucide-react";

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
      badgeClass: "bg-gradient-to-r from-emerald-500 to-teal-600 text-white",
      ringClass: "ring-emerald-500/20",
      dotClass: "bg-emerald-500",
    };
  }
  if (score >= 60) {
    return {
      label: "良好",
      badgeClass: "bg-gradient-to-r from-amber-500 to-orange-600 text-white",
      ringClass: "ring-amber-500/20",
      dotClass: "bg-amber-500",
    };
  }
  return {
    label: "需关注",
    badgeClass: "bg-gradient-to-r from-rose-500 to-pink-600 text-white",
    ringClass: "ring-rose-500/20",
    dotClass: "bg-rose-500",
  };
}

interface StatCardProps {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  gradient: string;
  delay?: number;
}

function StatCard({ title, value, description, icon: Icon, gradient, delay = 0 }: StatCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-slate-200/60 bg-white p-6 shadow-lg shadow-slate-900/5",
        "transition-all duration-500 hover:shadow-2xl hover:shadow-slate-900/10 hover:-translate-y-1"
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* 背景渐变装饰 */}
      <div
        className={cn(
          "absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-10 blur-3xl transition-all duration-700",
          "group-hover:scale-150 group-hover:opacity-20",
          gradient
        )}
      />

      {/* 图标容器 */}
      <div className="relative flex items-start justify-between">
        <div
          className={cn(
            "rounded-lg p-3.5 shadow-lg transition-all duration-500",
            "group-hover:scale-110 group-hover:rotate-6",
            gradient
          )}
        >
          <Icon className="h-6 w-6 text-white" strokeWidth={2.5} />
        </div>

        {/* 脉冲指示器 */}
        <div className="relative flex h-3 w-3">
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              gradient
            )}
          />
          <span className={cn("relative inline-flex h-3 w-3 rounded-full", gradient)} />
        </div>
      </div>

      {/* 内容区 */}
      <div className="relative mt-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{title}</p>
        <p className="mt-2 text-4xl font-black tracking-tighter text-slate-900">{value}</p>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
    </div>
  );
}

interface ProviderListCardProps {
  title: string;
  subtitle: string;
  items: ProviderHealthScore[];
  emptyText: string;
  tone: "positive" | "negative" | "neutral";
  sortKey?: string;
  windowParam?: number;
}

function ProviderListCard({
  title,
  subtitle,
  items,
  emptyText,
  tone,
  sortKey,
  windowParam,
}: ProviderListCardProps) {
  const toneConfig = {
    positive: {
      bg: "from-emerald-50 to-teal-50",
      border: "border-emerald-200/50",
      iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600",
      icon: Target,
    },
    negative: {
      bg: "from-rose-50 to-pink-50",
      border: "border-rose-200/50",
      iconBg: "bg-gradient-to-br from-rose-500 to-pink-600",
      icon: AlertTriangle,
    },
    neutral: {
      bg: "from-blue-50 to-indigo-50",
      border: "border-blue-200/50",
      iconBg: "bg-gradient-to-br from-blue-500 to-indigo-600",
      icon: BarChart3,
    },
  };

  const config = toneConfig[tone];
  const IconComponent = config.icon;

  return (
    <Card
      className={cn(
        "group relative overflow-hidden rounded-xl border shadow-lg shadow-slate-900/5",
        "transition-all duration-500 hover:shadow-2xl hover:shadow-slate-900/10",
        config.border
      )}
    >
      {/* 背景渐变 */}
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-30", config.bg)} />

      <CardHeader className="relative">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("rounded-lg p-2.5 shadow-md", config.iconBg)}>
              <IconComponent className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <CardTitle className="text-lg font-bold tracking-tight">{title}</CardTitle>
              <CardDescription className="text-xs">{subtitle}</CardDescription>
            </div>
          </div>
          {sortKey && (
            <Button size="sm" variant="ghost" className="text-xs" asChild>
              <Link
                href={`/dashboard/providers/health?window=${windowParam ?? 6}&sort=${sortKey}#${PROVIDER_TABLE_SECTION_ID}`}
              >
                查看全部 →
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="relative space-y-3">
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">{emptyText}</p>
        ) : (
          items.map((provider, index) => {
            const healthTone = getHealthLevel(provider.healthScore);
            return (
              <div
                key={`${provider.providerId}-${tone}`}
                className={cn(
                  "group/item relative overflow-hidden rounded-lg border border-white/60 bg-white/80 p-4",
                  "backdrop-blur-sm transition-all duration-300 hover:shadow-md hover:border-slate-300/60"
                )}
              >
                {/* 排名标识 */}
                <div className="absolute left-4 top-4">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white shadow-lg",
                      index === 0 && "bg-gradient-to-br from-yellow-400 to-orange-500",
                      index === 1 && "bg-gradient-to-br from-slate-400 to-slate-600",
                      index === 2 && "bg-gradient-to-br from-amber-600 to-amber-800",
                      index > 2 && "bg-gradient-to-br from-slate-300 to-slate-400"
                    )}
                  >
                    {index + 1}
                  </div>
                </div>

                {/* 内容 */}
                <div className="flex items-center justify-between pl-12">
                  <div className="flex-1">
                    <p className="text-base font-bold text-slate-900">{provider.providerName}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-600">
                      <span className="font-mono">
                        成功率 {formatPercent(provider.successRate)}
                      </span>
                      <span>·</span>
                      <span className="font-mono">P95 {formatLatency(provider.p95LatencyMs)}</span>
                    </div>
                  </div>

                  {/* 健康分数徽章 */}
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold shadow-md",
                      healthTone.badgeClass
                    )}
                  >
                    <span>{provider.healthScore.toFixed(1)}</span>
                    <span className="text-xs opacity-80">·</span>
                    <span className="text-xs">{healthTone.label}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function InlineProgress({ value, gradient }: { value: number; gradient: string }) {
  const safeValue = Math.min(Math.max(value, 0), 100);
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full transition-all duration-700",
          gradient
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
      gradient: "bg-gradient-to-br from-emerald-500 to-teal-600",
    },
    {
      title: "平均 P95 延迟",
      value: report.summary.averageP95Latency
        ? formatLatency(report.summary.averageP95Latency)
        : "--",
      description: "高峰期响应速度",
      icon: Zap,
      gradient: "bg-gradient-to-br from-cyan-500 to-blue-600",
    },
    {
      title: "请求总量",
      value: formatNumber(report.summary.totalRequests),
      description: `窗口共 ${report.summary.totalRequests.toLocaleString()} 次`,
      icon: Activity,
      gradient: "bg-gradient-to-br from-violet-500 to-purple-600",
    },
    {
      title: "熔断事件",
      value: totalCircuitEvents.toLocaleString(),
      description: "越少越稳定",
      icon: ShieldAlert,
      gradient: "bg-gradient-to-br from-rose-500 to-pink-600",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="mx-auto max-w-[1600px] space-y-8 px-6 py-10">
        {/* 超级英雄式顶部横幅 */}
        <section className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-10 shadow-2xl">
          {/* 背景装饰 - 网格 */}
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
              backgroundSize: "50px 50px",
            }}
          />

          {/* 背景装饰 - 渐变光晕 */}
          <div className="absolute -right-40 -top-40 h-96 w-96 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-gradient-to-br from-violet-500/20 to-purple-500/20 blur-3xl" />

          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            {/* 左侧：主要信息 */}
            <div className="flex-1 space-y-6">
              {/* 标签组 */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white backdrop-blur-sm">
                  <Gauge className="h-4 w-4" />
                  健康监控仪表盘
                </div>
                <div
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-bold shadow-lg",
                    healthLevel.badgeClass
                  )}
                >
                  {healthLevel.label}
                </div>
                <div className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white/80 backdrop-blur-sm">
                  {report.windowHours} 小时窗口
                </div>
              </div>

              {/* 健康分数展示 */}
              <div className="space-y-2">
                <p className="text-sm font-bold uppercase tracking-widest text-white/60">
                  平均健康指数
                </p>
                <div className="flex items-baseline gap-4">
                  <p className="text-7xl font-black tracking-tighter text-white">
                    {averageHealthScore.toFixed(1)}
                  </p>
                  <div className="text-sm text-white/70">
                    <p>最近生成: {report.generatedAt.toLocaleString()}</p>
                    <p>数据源: {report.summary.providerCount} 个供应商</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 右侧：控制面板 */}
            <div className="flex-shrink-0 space-y-4 lg:w-[400px]">
              {/* 时间窗口选择器 */}
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-white/60">时间窗口</p>
                <div className="flex flex-wrap gap-2">
                  {WINDOW_OPTIONS.map((option) => (
                    <Link
                      key={option.value}
                      href={`/dashboard/providers/health?window=${option.value}&sort=${sortKey}`}
                      className={cn(
                        "rounded-full px-5 py-2.5 text-sm font-bold transition-all duration-300",
                        report.windowHours === option.value
                          ? "bg-white text-slate-900 shadow-xl shadow-white/20 scale-105"
                          : "bg-white/10 text-white/80 hover:bg-white/20 backdrop-blur-sm"
                      )}
                    >
                      {option.label}
                    </Link>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm"
                    asChild
                  >
                    <Link
                      href={`/dashboard/providers/health?window=${report.windowHours}&sort=${sortKey}`}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>

              {/* 快速统计 */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "供应商", value: report.summary.providerCount.toString() },
                  { label: "请求总量", value: report.summary.totalRequests.toLocaleString() },
                  { label: "成功率", value: formatPercent(report.summary.averageSuccessRate) },
                  { label: "熔断", value: totalCircuitEvents.toLocaleString() },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-lg border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
                  >
                    <p className="text-xs font-bold uppercase tracking-wider text-white/60">
                      {stat.label}
                    </p>
                    <p className="mt-1 text-2xl font-black text-white">{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 统计卡片网格 */}
        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card, index) => (
            <StatCard key={card.title} {...card} delay={index * 100} />
          ))}
        </section>

        {/* 供应商列表卡片 */}
        <section className="grid gap-6 lg:grid-cols-3">
          <ProviderListCard
            title="表现最佳"
            subtitle="Top 3 健康度领先"
            items={bestProviders}
            emptyText="暂无数据"
            tone="positive"
            sortKey="score"
            windowParam={report.windowHours}
          />
          <ProviderListCard
            title="需要关注"
            subtitle="健康度最低的供应商"
            items={attentionProviders}
            emptyText="暂无风险供应商"
            tone="negative"
            sortKey="score"
            windowParam={report.windowHours}
          />

          {/* 延迟与稳定性剖析 */}
          <Card className="group relative overflow-hidden rounded-xl border border-blue-200/50 shadow-lg shadow-slate-900/5 transition-all duration-500 hover:shadow-2xl hover:shadow-slate-900/10">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-indigo-50 opacity-30" />

            <CardHeader className="relative">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 shadow-md">
                  <BarChart3 className="h-5 w-5 text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold tracking-tight">性能剖析</CardTitle>
                  <CardDescription className="text-xs">综合评估整体体验</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="relative space-y-5">
              {[
                {
                  label: "成功率",
                  value: normalizedMetrics.success,
                  gradient: "bg-gradient-to-r from-emerald-500 to-teal-600",
                },
                {
                  label: "响应延迟",
                  value: normalizedMetrics.latency,
                  gradient: "bg-gradient-to-r from-cyan-500 to-blue-600",
                },
                {
                  label: "熔断控制",
                  value: normalizedMetrics.circuit,
                  gradient: "bg-gradient-to-r from-violet-500 to-purple-600",
                },
                {
                  label: "成本稳定",
                  value: normalizedMetrics.cost,
                  gradient: "bg-gradient-to-r from-amber-500 to-orange-600",
                },
              ].map((metric) => (
                <div key={metric.label} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-700">{metric.label}</span>
                    <span className="font-mono text-sm font-bold text-slate-900">
                      {metric.value.toFixed(0)}%
                    </span>
                  </div>
                  <InlineProgress value={metric.value} gradient={metric.gradient} />
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        {/* 供应商详细表格 */}
        <section
          id={PROVIDER_TABLE_SECTION_ID}
          className="rounded-2xl border border-slate-200/60 bg-white p-8 shadow-2xl shadow-slate-900/5"
        >
          {/* 表格头部 */}
          <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-3xl font-black tracking-tight text-slate-900">供应商列表</h2>
              <p className="mt-1 text-sm text-slate-600">多维度排序，全面掌握供应商状态</p>
            </div>

            {/* 排序选择器 */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-bold text-slate-500">排序依据</span>
              {SORT_OPTIONS.map((option) => (
                <Link
                  key={option.value}
                  href={`/dashboard/providers/health?window=${report.windowHours}&sort=${option.value}#${PROVIDER_TABLE_SECTION_ID}`}
                  className={cn(
                    "rounded-full px-5 py-2 text-sm font-bold transition-all duration-300",
                    sortKey === option.value
                      ? "bg-gradient-to-r from-slate-900 to-slate-700 text-white shadow-xl shadow-slate-900/20 scale-105"
                      : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>

          {/* 表格 */}
          <div className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gradient-to-r from-slate-50 to-slate-100/50 hover:from-slate-50 hover:to-slate-100/50">
                  <TableHead className="text-xs font-black uppercase tracking-widest text-slate-600">
                    供应商
                  </TableHead>
                  <TableHead className="text-right text-xs font-black uppercase tracking-widest text-slate-600">
                    请求量
                  </TableHead>
                  <TableHead className="text-right text-xs font-black uppercase tracking-widest text-slate-600">
                    成功率
                  </TableHead>
                  <TableHead className="text-right text-xs font-black uppercase tracking-widest text-slate-600">
                    P95 延迟
                  </TableHead>
                  <TableHead className="text-right text-xs font-black uppercase tracking-widest text-slate-600">
                    熔断次数
                  </TableHead>
                  <TableHead className="text-right text-xs font-black uppercase tracking-widest text-slate-600">
                    成本波动
                  </TableHead>
                  <TableHead className="text-right text-xs font-black uppercase tracking-widest text-slate-600">
                    健康指数
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-16 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-3">
                        <AlertTriangle className="h-12 w-12 text-slate-300" />
                        <p className="text-lg font-semibold">
                          最近 {report.windowHours} 小时暂无数据
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {providers.map((provider, index) => {
                  const tone = getHealthLevel(provider.healthScore);
                  return (
                    <TableRow
                      key={provider.providerId}
                      className={cn(
                        "group transition-all duration-300 hover:bg-slate-50/50",
                        index % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                      )}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className={cn("h-2 w-2 rounded-full animate-pulse", tone.dotClass)}
                          />
                          <div className="flex flex-col gap-1.5">
                            <span className="text-base font-bold text-slate-900">
                              {provider.providerName}
                            </span>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline" className="text-xs font-semibold">
                                {provider.providerType}
                              </Badge>
                              {provider.groupTag && (
                                <Badge variant="secondary" className="text-xs font-semibold">
                                  {provider.groupTag}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold text-slate-700">
                        {provider.totalRequests.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-2">
                          <span className="font-mono text-sm font-bold text-slate-900">
                            {formatPercent(provider.successRate)}
                          </span>
                          <div className="w-24">
                            <InlineProgress
                              value={provider.successRate * 100}
                              gradient="bg-gradient-to-r from-emerald-500 to-teal-600"
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold text-slate-700">
                        {formatLatency(provider.p95LatencyMs)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold text-slate-700">
                        {provider.circuitEvents}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold text-slate-700">
                        {provider.costStddev.toFixed(3)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div
                          className={cn(
                            "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold shadow-md transition-all duration-300 group-hover:scale-105",
                            tone.badgeClass
                          )}
                        >
                          <span>{provider.healthScore.toFixed(1)}</span>
                          <span className="text-xs opacity-80">·</span>
                          <span className="text-xs">{tone.label}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}
