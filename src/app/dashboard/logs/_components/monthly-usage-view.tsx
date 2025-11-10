"use client";

import { useEffect, useMemo, useState } from "react";
import { getMonthlyUsageStatsAction } from "@/actions/usage-logs";
import type { MonthlyUsageStatsResult } from "@/repository/usage-logs";
import type { CurrencyCode } from "@/lib/utils/currency";
import { formatCurrency } from "@/lib/utils/currency";
import { formatTokenAmount } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Database, DollarSign, Gauge, ChevronDown, RefreshCw } from "lucide-react";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

interface MonthlyUsageViewProps {
  currencyCode?: CurrencyCode;
}

interface MonthOption {
  value: string; // YYYY-MM
  label: string;
}

function generateRecentMonths(count = 6): MonthOption[] {
  const today = new Date();
  today.setDate(1);
  today.setHours(0, 0, 0, 0);

  const options: MonthOption[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(today);
    date.setMonth(date.getMonth() - i);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    options.push({ value, label: `${date.getFullYear()}年${date.getMonth() + 1}月` });
  }
  return options;
}

export function MonthlyUsageView({ currencyCode = "USD" }: MonthlyUsageViewProps) {
  const monthOptions = useMemo(() => generateRecentMonths(6), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(monthOptions[0]?.value ?? "");
  const [viewMode, setViewMode] = useState("table");
  const [data, setData] = useState<MonthlyUsageStatsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const reload = async (month: string) => {
    setLoading(true);
    setError(null);
    const result = await getMonthlyUsageStatsAction(month);
    if (result.ok) {
      setData(result.data ?? null);
    } else {
      setData(null);
      setError(result.error ?? "无法获取月度统计");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!selectedMonth) return;
    reload(selectedMonth);
  }, [selectedMonth]);

  const chartData = useMemo(() => {
    if (!data) {
      return {
        consumptionTrend: [],
        requestTrend: [],
        tokenTrend: [],
        modelShare: [],
      };
    }

    const sortedDays = [...data.days].sort((a, b) => (a.date > b.date ? 1 : -1));

    const consumptionTrend = sortedDays.map((day) => ({
      date: day.date,
      label: day.date.slice(5),
      cost: Number(day.totalCost.toFixed(4)),
    }));

    const requestTrend = sortedDays.map((day) => ({
      date: day.date,
      label: day.date.slice(5),
      count: day.requestCount,
    }));

    const tokenTrend = sortedDays.map((day) => ({
      date: day.date,
      label: day.date.slice(5),
      inputTokens: day.totalInputTokens,
      outputTokens: day.totalOutputTokens,
      cacheReadTokens: day.cacheReadTokens,
      cacheCreationTokens: day.cacheCreationTokens,
    }));

    const costByModel = new Map<string, number>();
    sortedDays.forEach((day) => {
      day.models.forEach((model) => {
        costByModel.set(model.model, (costByModel.get(model.model) ?? 0) + model.totalCost);
      });
    });

    const modelShare = Array.from(costByModel.entries())
      .map(([model, value]) => ({ model, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    return { consumptionTrend, requestTrend, tokenTrend, modelShare };
  }, [data]);

  const chartPalette = [
    "#6366F1",
    "#22C55E",
    "#F97316",
    "#EC4899",
    "#06B6D4",
    "#FACC15",
  ];

  const renderTable = () => {
    if (loading) {
      return (
        <div className="space-y-3">
          {[...Array(5)].map((_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
          {error}
        </div>
      );
    }

    if (!data || data.days.length === 0) {
      return <div className="py-10 text-center text-sm text-muted-foreground">本月暂无统计数据</div>;
    }

    return (
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">月度消费统计</CardTitle>
          <CardDescription>展示 {data.month} 每日的请求次数与成本</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px]">日期</TableHead>
                <TableHead>请求次数</TableHead>
                <TableHead>总 Token</TableHead>
                <TableHead>消费金额</TableHead>
                <TableHead className="min-w-[220px]">模型统计</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.days.map((day) => (
                <TableRow key={day.date} className="hover:bg-muted/30">
                  <TableCell className="font-medium">{day.date}</TableCell>
                  <TableCell className="font-mono">{day.requestCount.toLocaleString()} 次</TableCell>
                  <TableCell className="font-mono">{formatTokenAmount(day.totalTokens)}</TableCell>
                  <TableCell className="font-semibold text-emerald-600">{formatCurrency(day.totalCost, currencyCode)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {day.models.slice(0, 3).map((model) => (
                        <Badge key={`${day.date}-${model.model}`} variant="secondary" className="rounded-full px-3 py-1 text-xs">
                          {model.model}: {model.requestCount} 次 / {formatCurrency(model.totalCost, currencyCode)}
                        </Badge>
                      ))}
                      {day.models.length === 0 && <span className="text-xs text-muted-foreground">暂无模型数据</span>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };

  const renderModelDetails = () => {
    if (!data || data.days.length === 0) {
      return null;
    }

    return (
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-base font-semibold">模型详细统计</CardTitle>
              <CardDescription>展开查看每日每个模型的请求与消耗情况</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.days.map((day) => {
            const isExpanded = expandedDay === day.date;
            return (
              <div
                key={`details-${day.date}`}
                className="rounded-2xl border border-border/60 bg-card/30 px-4 py-3 shadow-sm"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-left"
                  onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                >
                  <div className="flex flex-col gap-1 text-sm font-semibold">
                    <span>{day.date}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {day.requestCount.toLocaleString()} 次请求
                    </span>
                  </div>
                  <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </button>
                {isExpanded && (
                  <div className="mt-4 overflow-x-auto border-t border-border/40 pt-4">
                    {day.models.length === 0 ? (
                      <div className="py-2 text-sm text-muted-foreground">暂无模型数据</div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>模型</TableHead>
                            <TableHead>请求次数</TableHead>
                            <TableHead>输入 Token</TableHead>
                            <TableHead>输出 Token</TableHead>
                            <TableHead>缓存读取</TableHead>
                            <TableHead>缓存写入</TableHead>
                            <TableHead>总 Token</TableHead>
                            <TableHead>总费用</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {day.models.map((model) => (
                            <TableRow key={`${day.date}-${model.model}`}>
                              <TableCell className="font-medium">{model.model}</TableCell>
                              <TableCell className="font-mono">{model.requestCount.toLocaleString()}</TableCell>
                              <TableCell className="font-mono">{formatTokenAmount(model.inputTokens)}</TableCell>
                              <TableCell className="font-mono">{formatTokenAmount(model.outputTokens)}</TableCell>
                              <TableCell className="font-mono">{formatTokenAmount(model.cacheReadTokens)}</TableCell>
                              <TableCell className="font-mono">{formatTokenAmount(model.cacheCreationTokens)}</TableCell>
                              <TableCell className="font-mono">{formatTokenAmount(model.totalTokens)}</TableCell>
                              <TableCell className="font-semibold text-emerald-600">
                                {formatCurrency(model.totalCost, currencyCode)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  };

  const renderChart = () => {
    if (!data || chartData.consumptionTrend.length === 0) {
      return <div className="py-10 text-center text-sm text-muted-foreground">暂无可视化数据</div>;
    }

    const totalCost = chartData.modelShare.reduce((sum, item) => sum + item.value, 0);

    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">消费趋势</CardTitle>
            <CardDescription>展示每一天的消费金额变化</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              className="aspect-[4/3]"
              config={{ cost: { label: "消费金额" } }}
            >
              <AreaChart data={chartData.consumptionTrend}>
                <defs>
                  <linearGradient id="costGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                <XAxis
                  dataKey="label"
                  stroke="hsl(var(--muted-foreground))"
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(value) => `$${value}`}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area type="monotone" dataKey="cost" stroke="hsl(var(--chart-2))" strokeWidth={2} fill="url(#costGradient)" />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">请求次数趋势</CardTitle>
            <CardDescription>观察每日请求数量的波动</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              className="aspect-[4/3]"
              config={{ count: { label: "请求次数" } }}
            >
              <AreaChart data={chartData.requestTrend}>
                <defs>
                  <linearGradient id="requestGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area type="monotone" dataKey="count" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#requestGradient)" />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">模型消费占比</CardTitle>
            <CardDescription>按模型汇总本月消费金额</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <ChartContainer
              className="h-64 w-full max-w-full lg:w-1/2"
              config={{}}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData.modelShare}
                    dataKey="value"
                    nameKey="model"
                    innerRadius={60}
                    outerRadius={90}
                    strokeWidth={6}
                  >
                    {chartData.modelShare.map((entry, index) => (
                      <Cell key={entry.model} fill={chartPalette[index % chartPalette.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
            <div className="flex w-full flex-col gap-2 text-xs text-muted-foreground lg:w-1/2">
              {chartData.modelShare.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无模型数据</p>
              ) : (
                chartData.modelShare.map((entry, index) => {
                  const percent = totalCost ? ((entry.value / totalCost) * 100).toFixed(1) : "0";
                  return (
                    <div key={`legend-${entry.model}`} className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: chartPalette[index % chartPalette.length] }} />
                        <span className="max-w-[140px] truncate text-foreground">{entry.model}</span>
                      </div>
                      <span className="font-semibold text-foreground">{percent}%</span>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Token 统计</CardTitle>
            <CardDescription>分类型对比每日 Token 消耗</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              className="aspect-[4/3]"
              config={{
                inputTokens: { label: "输入 Token" },
                outputTokens: { label: "输出 Token" },
                cacheReadTokens: { label: "缓存读取" },
                cacheCreationTokens: { label: "缓存写入" },
              }}
            >
              <LineChart data={chartData.tokenTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line type="monotone" dataKey="inputTokens" stroke={chartPalette[0]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="outputTokens" stroke={chartPalette[1]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cacheReadTokens" stroke={chartPalette[2]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cacheCreationTokens" stroke={chartPalette[3]} strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">月度范围</p>
          <p className="text-xs text-muted-foreground">最近 6 个月数据，可切换查看</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[150px] rounded-xl">
              <SelectValue placeholder="选择月份" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => reload(selectedMonth)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
        </div>
      </div>

      {data && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-2xl border border-border/60 bg-card/80">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">总请求次数</p>
                <p className="text-2xl font-semibold">{data.totals.requestCount.toLocaleString()}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted/40 text-orange-500">
                <Activity className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border border-border/60 bg-card/80">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">总 Token</p>
                <p className="text-2xl font-semibold">{formatTokenAmount(data.totals.totalTokens)}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted/40 text-purple-500">
                <Database className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border border-border/60 bg-card/80">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">总费用</p>
                <p className="text-2xl font-semibold text-emerald-600">{formatCurrency(data.totals.totalCost, currencyCode)}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted/40 text-emerald-500">
                <DollarSign className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border border-border/60 bg-card/80">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">平均每日请求</p>
                <p className="text-2xl font-semibold">
                  {data.days.length
                    ? (data.totals.requestCount / data.days.length).toFixed(1)
                    : "0"}
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted/40 text-cyan-500">
                <Gauge className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={viewMode} onValueChange={setViewMode} className="space-y-6">
        <TabsList className="w-fit rounded-full bg-muted/40 p-1">
          <TabsTrigger
            value="table"
            className="rounded-full px-4 py-1 text-sm text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg"
          >
            表格视图
          </TabsTrigger>
          <TabsTrigger
            value="chart"
            className="rounded-full px-4 py-1 text-sm text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg"
          >
            图表视图
          </TabsTrigger>
        </TabsList>
        <TabsContent value="table" className="space-y-6">
          {renderTable()}
          {renderModelDetails()}
        </TabsContent>
        <TabsContent value="chart" className="space-y-6">
          {renderChart()}
          {renderModelDetails()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
