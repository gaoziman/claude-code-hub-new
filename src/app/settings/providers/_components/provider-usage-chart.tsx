"use client";

import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import type { ProviderUsageTrendPoint } from "@/types/provider";
import type { CurrencyCode } from "@/lib/utils/currency";
import { formatCurrency } from "@/lib/utils/currency";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface ProviderUsageChartProps {
  data: ProviderUsageTrendPoint[];
  currencyCode: CurrencyCode;
  loading?: boolean;
}

const chartConfig = {
  cost: {
    label: "费用 (USD)",
    color: "hsl(213, 92%, 62%)",
  },
  calls: {
    label: "请求次数",
    color: "hsl(27, 96%, 55%)",
  },
} satisfies ChartConfig;

function formatDateLabel(date: string) {
  try {
    return format(new Date(date), "MM-dd");
  } catch (error) {
    console.warn("格式化日期失败", error);
    return date;
  }
}

function formatYAxisValue(value: number, currencyCode: CurrencyCode, isCurrency = false) {
  if (!isCurrency) {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return `${value}`;
  }
  if (value >= 1000) {
    return `${formatCurrency(value / 1000, currencyCode, 1)}k`;
  }
  return formatCurrency(value, currencyCode, value < 1 ? 4 : 2);
}

export function ProviderUsageChart({ data, currencyCode, loading }: ProviderUsageChartProps) {
  const normalized = useMemo(() => {
    return data.map((point, index) => {
      const cost = Number(point.totalCostUsd ?? 0);
      const calls = Number(point.callCount ?? 0);
      return {
        date: point.date,
        label: formatDateLabel(point.date),
        cost,
        calls,
        index,
      };
    });
  }, [data]);

  // 计算显示间隔：30天数据，每隔3天显示一个标签（共约10个标签）
  const tickInterval = useMemo(() => {
    const dataLength = normalized.length;
    if (dataLength <= 15) return 0; // 少于15天，显示所有标签
    if (dataLength <= 30) return Math.floor(dataLength / 10); // 30天左右，显示约10个标签
    return Math.floor(dataLength / 12); // 更多天数，显示约12个标签
  }, [normalized.length]);

  if (!normalized.length && !loading) {
    return (
      <div className="flex h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 text-sm text-muted-foreground">
        暂无用量数据
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl border border-border/40 bg-gradient-to-br from-white via-blue-50/30 to-orange-50/20 p-5 shadow-lg dark:from-slate-900 dark:via-blue-950/30 dark:to-orange-950/20">
      {/* 图表标题和图例 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-[hsl(213,92%,62%)] shadow-sm" />
            <span className="text-sm font-medium text-muted-foreground">费用 (USD)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-[hsl(27,96%,55%)] shadow-sm" />
            <span className="text-sm font-medium text-muted-foreground">请求次数</span>
          </div>
        </div>
      </div>

      <ChartContainer config={chartConfig} className="aspect-[16/7] w-full">
        <ComposedChart data={normalized} margin={{ left: 12, right: 12, top: 10, bottom: 20 }}>
          <defs>
            <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(213, 92%, 62%)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(213, 92%, 62%)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            interval={tickInterval}
            height={40}
          />
          <YAxis
            yAxisId="cost"
            orientation="left"
            tickFormatter={(value) => formatYAxisValue(Number(value), currencyCode, true)}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "hsl(213, 92%, 62%)", fontWeight: 500 }}
          />
          <YAxis
            yAxisId="calls"
            orientation="right"
            tickFormatter={(value) => formatYAxisValue(Number(value), currencyCode, false)}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "hsl(27, 96%, 55%)", fontWeight: 500 }}
          />
          <ChartTooltip
            content={<ChartTooltipContent className="w-[220px] rounded-xl border-border/40 bg-white/95 backdrop-blur-sm dark:bg-slate-900/95" />}
            formatter={(value: number, name: string) => {
              if (name === "cost") {
                return [formatCurrency(value, currencyCode, value < 1 ? 4 : 2), "费用"];
              }
              return [`${value.toLocaleString()} 次`, "请求次数"];
            }}
            labelFormatter={(label: string) => `日期: ${label}`}
          />
          <Area
            yAxisId="cost"
            dataKey="cost"
            type="monotone"
            stroke="hsl(213, 92%, 62%)"
            fill="url(#costGradient)"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2, fill: "hsl(213, 92%, 62%)" }}
          />
          <Line
            yAxisId="calls"
            dataKey="calls"
            type="monotone"
            stroke="hsl(27, 96%, 55%)"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2, fill: "hsl(27, 96%, 55%)" }}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}

export default ProviderUsageChart;
