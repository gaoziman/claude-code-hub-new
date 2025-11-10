"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { getTopKeysUsageTrends } from "@/actions/statistics";
import type { KeyTrendData } from "@/types/statistics";
import type { CurrencyCode } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { RankingStrip, type RankingItem } from "../ranking-strip";

const REFRESH_INTERVAL = 30_000;
const COLOR_PALETTE = [
  "hsl(213, 92%, 62%)",
  "hsl(155, 70%, 45%)",
  "hsl(27, 96%, 55%)",
  "hsl(266, 65%, 60%)",
  "hsl(199, 89%, 62%)",
  "hsl(348, 85%, 56%)",
  "hsl(43, 96%, 56%)",
];

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
});

const numberFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 0,
});

const METRIC_OPTIONS = [
  { value: "cost", label: "消耗金额", helper: "金额" },
  { value: "calls", label: "调用次数", helper: "调用数" },
] as const;

type TrendMetric = (typeof METRIC_OPTIONS)[number]["value"];

interface KeyTrendPanelProps {
  title?: string;
  description?: string;
  initialData?: KeyTrendData;
  currencyCode?: CurrencyCode;
}

type TrendPoint = {
  date: string;
  displayDate: string;
  [key: string]: string | number;
};

async function fetchKeyTrends(): Promise<KeyTrendData> {
  const result = await getTopKeysUsageTrends();
  if (!result.ok) {
    throw new Error(result.error || "获取 API Keys 趋势失败");
  }
  return result.data;
}

export function KeyTrendPanel({
  title = "API Keys 使用趋势",
  description = "近 7 天内使用量前 7 的 API Keys 趋势",
  initialData,
  currencyCode = "USD",
}: KeyTrendPanelProps) {
  const [metric, setMetric] = React.useState<TrendMetric>("cost");
  const { data, isFetching, error } = useQuery<KeyTrendData, Error>({
    queryKey: ["key-trends"],
    queryFn: fetchKeyTrends,
    initialData,
    refetchInterval: REFRESH_INTERVAL,
  });

  React.useEffect(() => {
    if (error) {
      toast.error(error.message);
    }
  }, [error]);

  const totalCost = React.useMemo(() => {
    if (!data) return 0;
    return data.keys.reduce((sum, key) => sum + Number(key.totalCost ?? 0), 0);
  }, [data]);

  const totalCalls = React.useMemo(() => {
    if (!data) return 0;
    return data.keys.reduce((sum, key) => sum + Number(key.totalCalls ?? 0), 0);
  }, [data]);

  const rankingItems = React.useMemo<RankingItem[]>(() => {
    if (!data) return [];
    return data.keys
      .slice()
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 3)
      .map((key, index) => ({
        id: key.id,
        name: key.name,
        rank: index + 1,
        primary: formatCurrency(key.totalCost, currencyCode, 4),
        secondary: `${numberFormatter.format(key.totalCalls)} 次`,
      }));
  }, [currencyCode, data]);

  const chartNode = React.useMemo(() => {
    if (!data) {
      return <Skeleton className="h-[260px] w-full rounded-2xl" />;
    }

    if (!data.keys.length) {
      return <TrendEmptyState message="暂无 API Keys 数据" />;
    }

    return (
      <KeyTrendChart data={data} currencyCode={currencyCode} metric={metric} loading={isFetching} />
    );
  }, [currencyCode, data, isFetching, metric]);

  return (
    <div className="rounded-[28px] border border-border/60 bg-gradient-to-b from-white via-white to-slate-50 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)] dark:from-slate-900 dark:via-slate-900/95 dark:to-slate-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xl">
          <p className="text-lg font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            近 7 天使用量前 7 的 API Keys · {data?.keys.length ?? 0} 个 Key · 数据每 30 秒刷新
          </p>
        </div>
        {rankingItems.length > 0 ? (
          <RankingStrip
            title="Top 3 Keys"
            subtitle="按消耗金额"
            items={rankingItems}
            className="lg:flex-1"
          />
        ) : null}
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {METRIC_OPTIONS.map((option) => {
            const isActive = option.value === metric;
            return (
              <Button
                key={option.value}
                size="sm"
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "rounded-full px-4 py-2 text-xs font-medium transition-all",
                  isActive
                    ? "shadow-[0_8px_20px_rgba(59,130,246,0.25)]"
                    : "border border-border/60 bg-white/60 dark:bg-slate-900/40"
                )}
                onClick={() => setMetric(option.value)}
              >
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
        <MetricHighlight label="活跃 Key 数" value={`${data?.keys.length ?? 0}`} hint="近 7 天" />
        <MetricHighlight
          label="累计消耗"
          value={formatCurrency(totalCost, currencyCode, 4)}
          hint="含全部 Key"
        />
        <MetricHighlight
          label="总调用次数"
          value={numberFormatter.format(totalCalls)}
          hint="近 7 天"
        />
      </div>

      <div className="mt-6">{chartNode}</div>
    </div>
  );
}

interface KeyTrendChartProps {
  data: KeyTrendData;
  currencyCode: CurrencyCode;
  metric: TrendMetric;
  loading?: boolean;
}

function KeyTrendChart({ data, currencyCode, metric, loading }: KeyTrendChartProps) {
  const suffix = metric === "cost" ? "cost" : "calls";
  const chartConfig = React.useMemo<ChartConfig>(() => {
    const baseConfig: ChartConfig = {};
    data.keys.forEach((key, index) => {
      baseConfig[`${key.dataKey}_${suffix}`] = {
        label: key.name,
        color: COLOR_PALETTE[index % COLOR_PALETTE.length],
      };
    });
    return baseConfig;
  }, [data.keys, suffix]);

  const colorMap = React.useMemo(() => {
    const map = new Map<string, string>();
    Object.entries(chartConfig).forEach(([key, value]) => {
      if (value.color) {
        map.set(key, value.color);
      }
    });
    return map;
  }, [chartConfig]);

  const normalizedData = React.useMemo<TrendPoint[]>(() => {
    return data.chartData.map((day) => {
      const dateObj = new Date(day.date);
      const displayDate = dateFormatter.format(dateObj);
      const point: TrendPoint = {
        date: day.date,
        displayDate,
      };

      data.keys.forEach((key) => {
        const costKey = `${key.dataKey}_cost`;
        const callsKey = `${key.dataKey}_calls`;
        point[costKey] = Number(day[costKey] ?? 0);
        point[callsKey] = Number(day[callsKey] ?? 0);
      });

      return point;
    });
  }, [data.chartData, data.keys]);

  const tickFormatter = React.useCallback(
    (value: number) =>
      metric === "cost"
        ? formatCurrency(Number(value) || 0, currencyCode, value >= 1 ? 2 : 4)
        : numberFormatter.format(Number(value) || 0),
    [currencyCode, metric]
  );

  const [hiddenSeries, setHiddenSeries] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    setHiddenSeries((prev) => {
      const available = new Set(data.keys.map((key) => key.dataKey));
      let hasChanged = false;
      const next = new Set<string>();
      prev.forEach((key) => {
        if (available.has(key)) {
          next.add(key);
        } else {
          hasChanged = true;
        }
      });
      return hasChanged ? next : prev;
    });
  }, [data.keys]);

  const hiddenDataKeys = React.useMemo(() => {
    return Array.from(hiddenSeries).map((key) => `${key}_${suffix}`);
  }, [hiddenSeries, suffix]);

  const handleToggleSeries = React.useCallback((seriesKey: string) => {
    const normalized = seriesKey.replace(/_(cost|calls)$/i, "");
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(normalized)) {
        next.delete(normalized);
      } else {
        next.add(normalized);
      }
      return next;
    });
  }, []);

  if (!data.keys.length) {
    return <TrendEmptyState message="暂无 API Keys 数据" />;
  }

  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-[260px] w-full rounded-2xl bg-gradient-to-b from-slate-50 via-white to-white px-2 py-4 dark:from-slate-900/60 dark:via-slate-900 dark:to-slate-900"
    >
      <LineChart data={normalizedData} margin={{ left: 4, right: 24, top: 10, bottom: 4 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(var(--border))"
          opacity={0.35}
          vertical={false}
        />
        <XAxis
          dataKey="displayDate"
          tickLine={false}
          axisLine={false}
          tickMargin={12}
          minTickGap={32}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={12}
          width={metric === "cost" ? 100 : 70}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
          tickFormatter={tickFormatter}
        />
        <ChartTooltip
          content={
            <KeyTrendTooltip
              keys={data.keys}
              currencyCode={currencyCode}
              colorMap={colorMap}
              metric={metric}
              hiddenSeries={hiddenSeries}
            />
          }
          cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 2, opacity: 0.12 }}
        />
        <ChartLegend
          verticalAlign="top"
          align="right"
          content={
            <ChartLegendContent
              className="flex-wrap justify-end gap-3 pb-4 text-xs"
              interactive
              hiddenKeys={hiddenDataKeys}
              onToggleSeries={handleToggleSeries}
            />
          }
          wrapperStyle={{ paddingBottom: 0 }}
        />
        {data.keys.map((key) => {
          const dataKey = `${key.dataKey}_${suffix}`;
          const isHidden = hiddenSeries.has(key.dataKey);
          return (
            <Line
              key={dataKey}
              type="monotone"
              dataKey={dataKey}
              stroke={`var(--color-${dataKey})`}
              strokeWidth={2.5}
              dot={{ r: 4, strokeWidth: 2, fill: "hsl(var(--background))" }}
              activeDot={{ r: 6, strokeWidth: 2 }}
              hide={isHidden}
              isAnimationActive={!loading}
            />
          );
        })}
      </LineChart>
    </ChartContainer>
  );
}

interface KeyTrendTooltipProps {
  keys: KeyTrendData["keys"];
  currencyCode: CurrencyCode;
  colorMap: Map<string, string>;
  metric: TrendMetric;
  hiddenSeries?: Set<string>;
}

function KeyTrendTooltip({
  active,
  payload,
  keys,
  currencyCode,
  label,
  colorMap,
  metric,
  hiddenSeries,
}: KeyTrendTooltipProps & TooltipProps<number, string>) {
  if (!active || !payload?.length) {
    return null;
  }

  const datum = payload[0]?.payload as TrendPoint | undefined;
  if (!datum) return null;

  const mainSuffix = metric === "cost" ? "cost" : "calls";
  const secondarySuffix = metric === "cost" ? "calls" : "cost";

  const ranking = keys
    .map((key) => {
      const mainValue = Number(datum[`${key.dataKey}_${mainSuffix}`] ?? 0);
      const secondaryValue = Number(datum[`${key.dataKey}_${secondarySuffix}`] ?? 0);
      return {
        key,
        mainValue,
        secondaryValue,
        color: colorMap.get(`${key.dataKey}_${mainSuffix}`) ?? "hsl(var(--primary))",
      };
    })
    .filter(
      (item) =>
        (item.mainValue > 0 || item.secondaryValue > 0) && !hiddenSeries?.has(item.key.dataKey)
    )
    .sort((a, b) => b.mainValue - a.mainValue)
    .slice(0, 6);

  return (
    <div className="min-w-[220px] max-w-sm rounded-2xl border border-border/60 bg-background/95 p-4 shadow-xl backdrop-blur">
      <div className="text-sm font-semibold text-foreground">{datum.displayDate || label}</div>
      <div className="mt-3 space-y-2">
        {ranking.length === 0 ? (
          <div className="py-3 text-center text-xs text-muted-foreground">当天暂无消费记录</div>
        ) : (
          ranking.map((item) => (
            <div key={item.key.id} className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate text-xs text-muted-foreground" title={item.key.name}>
                  {item.key.name}
                </span>
              </div>
              <div className="text-right text-xs font-semibold text-foreground">
                {metric === "cost"
                  ? formatCurrency(item.mainValue, currencyCode, 4)
                  : `${numberFormatter.format(item.mainValue)} 次`}
                <div className="text-[11px] font-normal text-muted-foreground">
                  {metric === "cost"
                    ? `${numberFormatter.format(item.secondaryValue)} 次`
                    : formatCurrency(item.secondaryValue, currencyCode, 4)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MetricHighlight({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-white/70 px-4 py-3 dark:bg-slate-900/40">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function TrendEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-white/70 text-sm text-muted-foreground dark:bg-slate-900/40">
      {message}
    </div>
  );
}
