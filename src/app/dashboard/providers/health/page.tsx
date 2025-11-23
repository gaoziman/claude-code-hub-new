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
    <div className="rounded-2xl border border-border/60 bg-gradient-to-b from-white to-slate-50 p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={cn("rounded-2xl p-2", accent)}>
          <Icon className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
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
    <Card className="rounded-3xl border-border/70 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </div>
        {sortKey && (
          <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" asChild>
            <Link
              href={`/dashboard/providers/health?window=${windowParam ?? 6}&sort=${sortKey}#${PROVIDER_TABLE_SECTION_ID}`}
            >
              查看全部
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          items.map((provider, index) => {
            const healthTone = getHealthLevel(provider.healthScore);
            return (
              <div
                key={`${provider.providerId}-${badgeTone}`}
                className="flex items-center justify-between rounded-2xl border border-border/50 bg-white/80 p-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
                      badgeTone === "positive"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-rose-50 text-rose-700"
                    )}
                  >
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{provider.providerName}</p>
                    <p className="text-xs text-muted-foreground">
                      成功率 {formatPercent(provider.successRate)} · P95{" "}
                      {formatLatency(provider.p95LatencyMs)}
                    </p>
                  </div>
                </div>
                <div
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    badgeTone === "positive"
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-rose-50 text-rose-600"
                  )}
                >
                  {provider.healthScore.toFixed(1)} · {healthTone.label}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
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
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full",
          tone === "emerald" ? "bg-emerald-500" : "bg-slate-500"
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
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
      <section className="rounded-2xl border border-border/30 bg-gradient-to-br from-white to-emerald-50/30 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-emerald-700 shadow-sm">
                <Gauge className="h-4 w-4" /> 健康洞察 · {report.windowHours} 小时窗口
              </span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  healthLevel.badgeClass
                )}
              >
                {healthLevel.label}
              </span>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  平均健康指数
                </p>
                <p className="text-3xl font-semibold tracking-tight text-foreground">
                  {averageHealthScore.toFixed(1)}
                </p>
              </div>
              <div className="text-xs text-muted-foreground">
                <p>最近生成：{report.generatedAt.toLocaleString()}</p>
                <p>数据源：{report.summary.providerCount} 个供应商</p>
              </div>
            </div>
          </div>
          <div className="space-y-2 lg:w-1/2">
            <div className="flex flex-wrap items-center gap-1">
              {WINDOW_OPTIONS.map((option) => (
                <Link
                  key={option.value}
                  href={`/dashboard/providers/health?window=${option.value}&sort=${sortKey}`}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-medium transition",
                    report.windowHours === option.value
                      ? "border-transparent bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                      : "border-border/60 bg-white/70 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option.label}
                </Link>
              ))}
              <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground" asChild>
                <Link
                  href={`/dashboard/providers/health?window=${report.windowHours}&sort=${sortKey}`}
                >
                  <RefreshCw className="h-4 w-4" /> 刷新
                </Link>
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                {
                  label: "覆盖供应商",
                  value: report.summary.providerCount.toString(),
                  hint: "参与评分账号",
                },
                {
                  label: "请求总量",
                  value: report.summary.totalRequests.toLocaleString(),
                  hint: "窗口内全部请求",
                },
                {
                  label: "平均成功率",
                  value: formatPercent(report.summary.averageSuccessRate),
                  hint: "整体稳定性",
                },
                {
                  label: "熔断事件",
                  value: totalCircuitEvents.toLocaleString(),
                  hint: "需重点监控",
                },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-white/70 bg-white/90 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.hint}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <ProviderListCard
          title="表现最佳"
          subtitle="Top 3 健康度 ≥ 70"
          items={bestProviders}
          emptyText="暂无可用数据"
          badgeTone="positive"
          sortKey="score"
          windowParam={report.windowHours}
        />
        <ProviderListCard
          title="需要关注"
          subtitle="健康度最低的三家供应商"
          items={attentionProviders}
          emptyText="暂无风险供应商"
          badgeTone="negative"
          sortKey="score"
          windowParam={report.windowHours}
        />
        <Card className="rounded-3xl border-border/70 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">延迟与稳定性剖析</CardTitle>
            <CardDescription>结合 P95 与得分评估整体体验</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              {[
                {
                  label: "成功率",
                  value: normalizedMetrics.success,
                },
                {
                  label: "响应延迟",
                  value: normalizedMetrics.latency,
                },
                {
                  label: "熔断控制",
                  value: normalizedMetrics.circuit,
                },
                {
                  label: "成本稳定",
                  value: normalizedMetrics.cost,
                },
              ].map((metric) => (
                <div key={metric.label}>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{metric.label}</span>
                    <span>{metric.value.toFixed(0)}%</span>
                  </div>
                  <InlineProgress value={metric.value} tone="emerald" />
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-dashed border-border/70 p-3">
              <p className="text-xs font-semibold text-muted-foreground">延迟领先</p>
              {latencyLeaders.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无有效延迟数据</p>
              ) : (
                latencyLeaders.map((provider) => (
                  <div
                    key={`latency-${provider.providerId}`}
                    className="mt-2 flex items-center justify-between text-sm"
                  >
                    <span>{provider.providerName}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatLatency(provider.p95LatencyMs)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section
        id={PROVIDER_TABLE_SECTION_ID}
        className="rounded-[32px] border border-border/70 bg-white/95 p-6 shadow-[0_30px_70px_rgba(15,23,42,0.08)]"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">供应商列表</h2>
            <p className="text-sm text-muted-foreground">支持多维度排序，点击列头了解指标定义</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">排序依据</span>
            {SORT_OPTIONS.map((option) => (
              <Link
                key={option.value}
                href={`/dashboard/providers/health?window=${report.windowHours}&sort=${option.value}#${PROVIDER_TABLE_SECTION_ID}`}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition",
                  sortKey === option.value
                    ? "border-transparent bg-emerald-600 text-white shadow-lg shadow-emerald-600/40"
                    : "border-border/70 bg-white text-muted-foreground hover:text-foreground"
                )}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-6 overflow-hidden rounded-3xl border border-border/50">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  供应商
                </TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  请求量
                </TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  成功率
                </TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  P95 延迟
                </TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  熔断次数
                </TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  成本波动
                </TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  健康指数
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    最近 {report.windowHours} 小时暂无请求数据
                  </TableCell>
                </TableRow>
              )}
              {providers.map((provider) => {
                const tone = getHealthLevel(provider.healthScore);
                return (
                  <TableRow key={provider.providerId} className="bg-white/80">
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-foreground">{provider.providerName}</span>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-xs">
                            {provider.providerType}
                          </Badge>
                          {provider.groupTag && (
                            <Badge variant="secondary" className="text-xs">
                              {provider.groupTag}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {provider.totalRequests.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono">{formatPercent(provider.successRate)}</span>
                        <div className="w-24">
                          <InlineProgress value={provider.successRate * 100} tone="emerald" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {formatLatency(provider.p95LatencyMs)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {provider.circuitEvents}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {provider.costStddev.toFixed(3)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold",
                          tone.badgeClass
                        )}
                      >
                        {provider.healthScore.toFixed(1)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
