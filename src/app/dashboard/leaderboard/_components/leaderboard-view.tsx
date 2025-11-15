"use client";

import { useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { LeaderboardTable } from "./leaderboard-table";
import type { LeaderboardEntry } from "@/repository/leaderboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency, type CurrencyCode } from "@/lib/utils/currency";
import { formatTokenAmount } from "@/lib/utils";
import { Download, RefreshCw, Search, Crown, TrendingUp, Users } from "lucide-react";

type LeaderboardPeriod = "daily" | "monthly";
type LeaderboardMetric = "cost" | "requests" | "tokens";
type LimitMode = "top10" | "top25" | "all";

interface LeaderboardViewProps {
  viewer: {
    id: number;
    role: "admin" | "user";
    name?: string | null;
  } | null;
  currencyCode: CurrencyCode;
}

type LeaderboardApiEntry = LeaderboardEntry & {
  totalCostFormatted?: string;
};

const periodOptions: { value: LeaderboardPeriod; label: string }[] = [
  { value: "daily", label: "今日排行" },
  { value: "monthly", label: "本月排行" },
];

const metricOptions: {
  value: LeaderboardMetric;
  label: string;
  description: string;
}[] = [
  { value: "cost", label: "消耗金额", description: "美元" },
  { value: "requests", label: "请求次数", description: "调用" },
  { value: "tokens", label: "Token 数", description: "合计" },
];

const limitOptions: { value: LimitMode; label: string }[] = [
  { value: "top10", label: "Top 10" },
  { value: "top25", label: "Top 25" },
  { value: "all", label: "全部" },
];

const compactFormatter = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  compactDisplay: "short",
});

export function LeaderboardView({ viewer, currencyCode }: LeaderboardViewProps) {
  const [dataset, setDataset] = useState<Record<LeaderboardPeriod, LeaderboardApiEntry[]>>({
    daily: [],
    monthly: [],
  });
  const [period, setPeriod] = useState<LeaderboardPeriod>("daily");
  const [metric, setMetric] = useState<LeaderboardMetric>("cost");
  const [limitMode, setLimitMode] = useState<LimitMode>("top10");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const isAdmin = viewer?.role === "admin";

  const fetchData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const [dailyRes, monthlyRes] = await Promise.all([
        fetch("/api/leaderboard?period=daily"),
        fetch("/api/leaderboard?period=monthly"),
      ]);

      if (!dailyRes.ok || !monthlyRes.ok) {
        throw new Error("获取排行榜数据失败");
      }

      const [daily, monthly] = (await Promise.all([
        dailyRes.json(),
        monthlyRes.json(),
      ])) as LeaderboardApiEntry[][];

      setDataset({
        daily,
        monthly,
      });
      setError(null);
      setLastUpdatedAt(new Date());
    } catch (err) {
      console.error("获取排行榜数据失败:", err);
      setError(err instanceof Error ? err.message : "获取排行榜数据失败");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const currentData = useMemo(() => dataset[period] ?? [], [dataset, period]);
  const comparisonData = useMemo(
    () => dataset[period === "daily" ? "monthly" : "daily"] ?? [],
    [dataset, period]
  );

  const metricValue = useCallback(
    (entry: LeaderboardEntry) => {
      if (metric === "cost") return entry.totalCost;
      if (metric === "requests") return entry.totalRequests;
      return entry.totalTokens;
    },
    [metric]
  );

  const sortedData = useMemo(() => {
    return [...currentData].sort((a, b) => metricValue(b) - metricValue(a));
  }, [currentData, metricValue]);

  const comparisonRanks = useMemo(() => {
    const sorted = [...comparisonData].sort((a, b) => metricValue(b) - metricValue(a));
    const map = new Map<number, number>();
    sorted.forEach((entry, index) => map.set(entry.userId, index + 1));
    return map;
  }, [comparisonData, metricValue]);

  const searchLower = search.trim().toLowerCase();
  const filteredData = useMemo(() => {
    if (!searchLower) {
      return sortedData;
    }
    return sortedData.filter((entry) => entry.userName.toLowerCase().includes(searchLower));
  }, [sortedData, searchLower]);

  const limitedData = useMemo(() => {
    if (limitMode === "all") {
      return filteredData;
    }
    const size = limitMode === "top10" ? 10 : 25;
    return filteredData.slice(0, size);
  }, [filteredData, limitMode]);

  const totals = useMemo(() => {
    return filteredData.reduce(
      (acc, entry) => {
        acc.cost += entry.totalCost;
        acc.requests += entry.totalRequests;
        acc.tokens += entry.totalTokens;
        return acc;
      },
      { cost: 0, requests: 0, tokens: 0 }
    );
  }, [filteredData]);

  const topThree = useMemo(() => limitedData.slice(0, 3), [limitedData]);
  const topThreeContribution = useMemo(() => {
    const totalMetric = sortedData.reduce((sum, entry) => sum + metricValue(entry), 0);
    if (!totalMetric) {
      return 0;
    }
    const topMetric = topThree.reduce((sum, entry) => sum + metricValue(entry), 0);
    return topMetric / totalMetric;
  }, [sortedData, topThree, metricValue]);

  const viewerRankInfo = useMemo(() => {
    if (!viewer) return null;
    const index = sortedData.findIndex((entry) => entry.userId === viewer.id);
    if (index === -1) return null;
    return { rank: index + 1, entry: sortedData[index] };
  }, [sortedData, viewer]);

  const metricSummaryText = useMemo(() => {
    if (metric === "cost") {
      return formatCurrency(totals.cost, currencyCode);
    }
    if (metric === "requests") {
      return `${totals.requests.toLocaleString()} 次`;
    }
    return formatTokenAmount(totals.tokens);
  }, [totals, metric, currencyCode]);

  const metricAverageText = useMemo(() => {
    const count = filteredData.length || 1;
    if (metric === "cost") {
      return formatCurrency(totals.cost / count, currencyCode);
    }
    if (metric === "requests") {
      return `${Math.round(totals.requests / count).toLocaleString()} 次`;
    }
    return formatTokenAmount(Math.round(totals.tokens / count));
  }, [filteredData.length, totals, metric, currencyCode]);

  const currentIds = useMemo(
    () => new Set(currentData.map((entry) => entry.userId)),
    [currentData]
  );
  const comparisonIds = useMemo(
    () => new Set(comparisonData.map((entry) => entry.userId)),
    [comparisonData]
  );

  const newEntriesCount = useMemo(() => {
    let count = 0;
    currentData.forEach((entry) => {
      if (!comparisonIds.has(entry.userId)) {
        count += 1;
      }
    });
    return count;
  }, [currentData, comparisonIds]);

  const droppedEntriesCount = useMemo(() => {
    let count = 0;
    comparisonData.forEach((entry) => {
      if (!currentIds.has(entry.userId)) {
        count += 1;
      }
    });
    return count;
  }, [comparisonData, currentIds]);

  const lastUpdatedLabel = lastUpdatedAt
    ? lastUpdatedAt.toLocaleTimeString("zh-CN", { hour12: false })
    : "暂无";

  const handleExport = () => {
    const header = ["排名", "用户", "请求数", "Token 数", "消耗金额"];
    const rows = limitedData.map((entry, index) => [
      index + 1,
      entry.userName,
      entry.totalRequests,
      entry.totalTokens,
      entry.totalCost,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${value}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `leaderboard-${period}-${metric}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const actionButtons = (
    <div className="flex items-center gap-2">
      {isAdmin && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={limitedData.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          导出 CSV
        </Button>
      )}
      <Button variant="secondary" size="sm" onClick={fetchData} disabled={isRefreshing}>
        <RefreshCw className={cn("mr-2 h-4 w-4", isRefreshing && "animate-spin")} />
        {isRefreshing ? "刷新中" : "刷新"}
      </Button>
    </div>
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">排行榜加载中…</CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-destructive">{error}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SummaryCard
            title={`${metricOptions.find((opt) => opt.value === metric)?.label ?? ""}累计`}
            value={metricSummaryText}
            icon={<TrendingUp className="h-5 w-5 text-primary" />}
            subtitle={`当前筛选共 ${filteredData.length} 位用户`}
            meta={[
              {
                label:
                  metric === "cost"
                    ? "人均消耗"
                    : metric === "requests"
                      ? "人均调用"
                      : "人均 Token",
                value: filteredData.length ? metricAverageText : "—",
              },
              {
                label: "Top3 贡献",
                value: topThreeContribution ? `${Math.round(topThreeContribution * 100)}%` : "—",
              },
            ]}
          />
          <SummaryCard
            title="Top 1 用户"
            value={topThree[0]?.userName ?? "暂无数据"}
            icon={<Crown className="h-5 w-5 text-yellow-500" />}
            subtitle={
              topThree[0]
                ? `贡献 ${
                    metric === "cost"
                      ? formatCurrency(topThree[0].totalCost, currencyCode)
                      : metricValue(topThree[0]).toLocaleString()
                  }`
                : "等待数据"
            }
            meta={
              topThree[0]
                ? [
                    {
                      label: "请求次数",
                      value: topThree[0].totalRequests.toLocaleString(),
                    },
                    {
                      label: "Token 数",
                      value: formatTokenAmount(topThree[0].totalTokens),
                    },
                  ]
                : undefined
            }
          />
          <SummaryCard
            title="榜单人数"
            value={filteredData.length.toString()}
            icon={<Users className="h-5 w-5 text-emerald-500" />}
            subtitle={`数据更新于 ${lastUpdatedLabel}`}
            meta={[
              {
                label: "新上榜",
                value: newEntriesCount.toString(),
              },
              {
                label: "掉榜",
                value: droppedEntriesCount.toString(),
              },
            ]}
          />
        </div>
        {viewer?.role === "user" && (
          <MyRankCard
            periodLabel={period === "daily" ? "今日" : "本月"}
            viewer={viewer}
            viewerRankInfo={viewerRankInfo}
            currencyCode={currencyCode}
            metric={metric}
          />
        )}
      </div>

      <div className="space-y-3 rounded-3xl border border-border/60 bg-card/70 p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedControl
            value={period}
            onChange={(value) => setPeriod(value as LeaderboardPeriod)}
            options={periodOptions}
          />
          <SegmentedControl
            value={metric}
            onChange={(value) => setMetric(value as LeaderboardMetric)}
            options={metricOptions.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-full lg:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索用户名称…"
                className="pl-8"
              />
            </div>
            <SegmentedControl
              value={limitMode}
              onChange={(value) => setLimitMode(value as LimitMode)}
              options={limitOptions}
              size="sm"
            />
          </div>
          {actionButtons}
        </div>

        {topThree.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topThree.map((entry, index) => (
              <TopPerformerCard
                key={entry.userId}
                rank={index + 1}
                entry={entry}
                metric={metric}
                currencyCode={currencyCode}
              />
            ))}
          </div>
        )}

        <LeaderboardTable
          data={limitedData}
          metric={metric}
          currencyCode={currencyCode}
          comparisonRanks={comparisonRanks}
          viewerId={viewer?.id}
        />
      </div>
    </div>
  );
}

type SummaryCardProps = {
  title: string;
  value: string;
  hint?: string;
  subtitle?: string;
  icon?: ReactNode;
  meta?: { label: string; value: string }[];
};

function SummaryCard({ title, value, subtitle, hint, icon, meta }: SummaryCardProps) {
  return (
    <Card className="border-border/50 shadow-sm h-full">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-xl font-semibold">{value}</p>
          </div>
          {icon ? <div className="rounded-2xl bg-muted/60 p-2">{icon}</div> : null}
        </div>
        {subtitle ? (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        ) : hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
        {meta && meta.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            {meta.map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-dashed border-border/60 px-2 py-1"
              >
                <p className="text-[11px] uppercase tracking-wide">{item.label}</p>
                <p className="text-sm font-semibold text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MyRankCard({
  viewer,
  viewerRankInfo,
  periodLabel,
  currencyCode,
  metric,
}: {
  viewer: LeaderboardViewProps["viewer"];
  viewerRankInfo: { rank: number; entry: LeaderboardEntry } | null;
  periodLabel: string;
  currencyCode: CurrencyCode;
  metric: LeaderboardMetric;
}) {
  const metricValueText = viewerRankInfo
    ? metric === "cost"
      ? formatCurrency(viewerRankInfo.entry.totalCost, currencyCode)
      : metric === "requests"
        ? `${viewerRankInfo.entry.totalRequests.toLocaleString()} 次`
        : formatTokenAmount(viewerRankInfo.entry.totalTokens)
    : "—";

  return (
    <Card className="w-full max-w-sm border-border/50 shadow-sm">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">我的{periodLabel}排名</p>
            <p className="text-xl font-semibold">
              {viewer && viewerRankInfo ? `#${viewerRankInfo.rank}` : "未上榜"}
            </p>
          </div>
          {viewer && (
            <Badge variant="secondary" className="rounded-full">
              {viewer.role === "admin" ? "管理员" : "普通用户"}
            </Badge>
          )}
        </div>
        {viewer ? (
          <div className="rounded-2xl border border-dashed border-border/60 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">用户</span>
              <span className="font-medium">{viewer.name ?? "未知用户"}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-muted-foreground">
                {metricOptions.find((item) => item.value === metric)?.label}
              </span>
              <span className="font-semibold">{metricValueText}</span>
            </div>
            {!viewerRankInfo && (
              <p className="mt-2 text-xs text-muted-foreground">继续调用 API，争取挤进排行榜！</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">登录后可查看自己的排名表现。</p>
        )}
      </CardContent>
    </Card>
  );
}

function TopPerformerCard({
  rank,
  entry,
  metric,
  currencyCode,
}: {
  rank: number;
  entry: LeaderboardEntry;
  metric: LeaderboardMetric;
  currencyCode: CurrencyCode;
}) {
  const medalColors = [
    "from-yellow-400 to-orange-500",
    "from-gray-300 to-gray-400",
    "from-amber-700 to-amber-900",
  ];
  const gradient = medalColors[rank - 1] ?? "from-slate-200 to-slate-400";
  const metricValueText =
    metric === "cost"
      ? formatCurrency(entry.totalCost, currencyCode)
      : metric === "requests"
        ? `${entry.totalRequests.toLocaleString()} 次`
        : formatTokenAmount(entry.totalTokens);

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold text-white",
              `bg-gradient-to-r ${gradient}`
            )}
          >
            #{rank}
          </div>
          <p className="font-medium">{entry.userName}</p>
        </div>
        <p className="text-sm font-semibold">{metricValueText}</p>
      </div>
      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span>请求数 {compactFormatter.format(entry.totalRequests)}</span>
        <span>Token {compactFormatter.format(entry.totalTokens)}</span>
      </div>
    </div>
  );
}

function SegmentedControl({
  value,
  onChange,
  options,
  size = "md",
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  size?: "sm" | "md";
}) {
  const basePadding = size === "sm" ? "px-3 py-1" : "px-4 py-1.5";

  return (
    <div className="flex rounded-full border border-border/60 bg-muted/60 p-1 text-sm shadow-inner">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            basePadding,
            size === "sm" ? "text-xs" : "text-sm",
            value === option.value
              ? "bg-primary text-primary-foreground shadow-[0_6px_25px_rgba(37,99,235,0.35)]"
              : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
