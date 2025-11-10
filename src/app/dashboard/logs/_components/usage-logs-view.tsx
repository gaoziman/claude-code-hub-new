"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getUsageLogs } from "@/actions/usage-logs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Pause, Play, Activity, Coins, SquareStack, HardDrive } from "lucide-react";
import { UsageLogsFilters } from "./usage-logs-filters";
import { UsageLogsTable } from "./usage-logs-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UsageLogsResult } from "@/repository/usage-logs";
import type { UserDisplay } from "@/types/user";
import type { ProviderDisplay } from "@/types/provider";
import type { Key } from "@/types/key";
import type { CurrencyCode } from "@/lib/utils/currency";
import { formatCurrency } from "@/lib/utils/currency";
import { formatTokenAmount } from "@/lib/utils";
import { MonthlyUsageView } from "./monthly-usage-view";

/**
 * 将 Date 对象格式化为 date 格式的字符串 (YYYY-MM-DD)
 * 用于 URL 参数传递
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 获取今天的日期对象（本地时间，时分秒为 00:00:00）
 */
function getTodayDate(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * 解析 date 格式的字符串为本地时间的 Date 对象
 * 避免 new Date("2025-11-06") 被解析为 UTC 时间导致的时区问题
 */
function parseDate(dateString: string): Date {
  // 输入格式: "2025-11-06"
  const [year, month, day] = dateString.split('-').map(Number);
  // 创建本地时间的日期对象（注意：月份是从 0 开始的）
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

interface UsageLogsViewProps {
  isAdmin: boolean;
  isChildKeyView?: boolean;
  users: UserDisplay[];
  providers: ProviderDisplay[];
  initialKeys: Key[];
  searchParams: { [key: string]: string | string[] | undefined };
  currencyCode?: CurrencyCode;
}

const DEFAULT_PAGE_SIZE = 20;

export function UsageLogsView({
  isAdmin,
  isChildKeyView = false,
  users,
  providers,
  initialKeys,
  searchParams,
  currencyCode = "USD",
}: UsageLogsViewProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState<UsageLogsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(isAdmin ? "details" : "monthly");

  // 追踪新增记录（用于动画高亮）
  const [newLogIds, setNewLogIds] = useState<Set<number>>(new Set());
  const previousLogsRef = useRef<Map<number, boolean>>(new Map());
  const previousParamsRef = useRef<string>('');

  // 从 URL 参数解析筛选条件
  const filters: {
    userId?: number;
    keyId?: number;
    providerId?: number;
    date?: Date; // 单个日期，查询当天的记录
    statusCode?: number;
    model?: string;
    page: number;
    pageSize: number;
  } = {
    userId: searchParams.userId ? parseInt(searchParams.userId as string) : undefined,
    keyId: searchParams.keyId ? parseInt(searchParams.keyId as string) : undefined,
    providerId: searchParams.providerId ? parseInt(searchParams.providerId as string) : undefined,
    date: searchParams.date ? parseDate(searchParams.date as string) : getTodayDate(), // 使用 parseDate 解析本地时间
    statusCode: searchParams.statusCode ? parseInt(searchParams.statusCode as string) : undefined,
    model: searchParams.model as string | undefined,
    page: (() => {
      const parsed = searchParams.page ? parseInt(searchParams.page as string) : 1;
      if (!parsed || Number.isNaN(parsed) || parsed < 1) {
        return 1;
      }
      return parsed;
    })(),
    pageSize: (() => {
      const parsed = searchParams.pageSize ? parseInt(searchParams.pageSize as string) : undefined;
      if (!parsed || Number.isNaN(parsed) || parsed <= 0) {
        return DEFAULT_PAGE_SIZE;
      }
      return parsed;
    })(),
  };

  // 使用 ref 来存储最新的值,避免闭包陷阱
  const isPendingRef = useRef(isPending);
  const filtersRef = useRef(filters);

  isPendingRef.current = isPending;

  // 更新 filtersRef
  filtersRef.current = filters;

  // 加载数据
  // shouldDetectNew: 是否检测新增记录（只在刷新时为 true，筛选/翻页时为 false）
  const loadData = async (shouldDetectNew = false) => {
    startTransition(async () => {
      const result = await getUsageLogs(filtersRef.current);
      if (result.ok && result.data) {
        // 只在刷新时检测新增（非筛选/翻页）
        if (shouldDetectNew && previousLogsRef.current.size > 0) {
          const newIds = result.data.logs
            .filter(log => !previousLogsRef.current.has(log.id))
            .map(log => log.id)
            .slice(0, 10); // 限制最多高亮 10 条

          if (newIds.length > 0) {
            setNewLogIds(new Set(newIds));
            // 800ms 后清除高亮
            setTimeout(() => setNewLogIds(new Set()), 800);
          }
        }

        // 更新记录缓存
        previousLogsRef.current = new Map(
          result.data.logs.map(log => [log.id, true])
        );

        setData(result.data);
        setError(null);
      } else {
        setError(!result.ok && 'error' in result ? result.error : "加载失败");
        setData(null);
      }
    });
  };

  // 手动刷新（检测新增）
  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    await loadData(true); // 刷新时检测新增
    setTimeout(() => setIsManualRefreshing(false), 500);
  };

  // 监听 URL 参数变化（筛选/翻页时重置缓存）
  useEffect(() => {
    const currentParams = params.toString();

    if (previousParamsRef.current && previousParamsRef.current !== currentParams) {
      // URL 变化 = 用户操作（筛选/翻页），重置缓存，不检测新增
      previousLogsRef.current = new Map();
      loadData(false);
    } else if (!previousParamsRef.current) {
      // 首次加载，不检测新增
      loadData(false);
    }

    previousParamsRef.current = currentParams;
  }, [params]);

  // 自动轮询（3秒间隔，检测新增）
  useEffect(() => {
    if (!isAutoRefresh) return;
    if (!isAdmin && activeTab !== "details") return;

    const intervalId = setInterval(() => {
      // 如果正在加载,跳过本次轮询
      if (isPendingRef.current) return;
      loadData(true); // 自动刷新时检测新增
    }, 3000); // 3 秒间隔

    return () => clearInterval(intervalId);
  }, [isAutoRefresh, isAdmin, activeTab]);  

  // 处理筛选条件变更
  const handleFilterChange = (newFilters: Omit<typeof filters, "page" | "pageSize">) => {
    const query = new URLSearchParams();

    if (newFilters.userId) query.set("userId", newFilters.userId.toString());
    if (newFilters.keyId) query.set("keyId", newFilters.keyId.toString());
    if (newFilters.providerId) query.set("providerId", newFilters.providerId.toString());
    // 使用日期格式传递 (YYYY-MM-DD)
    if (newFilters.date) query.set("date", formatDate(newFilters.date));
    if (newFilters.statusCode) query.set("statusCode", newFilters.statusCode.toString());
    if (newFilters.model) query.set("model", newFilters.model);
    query.set("page", "1");
    query.set("pageSize", filters.pageSize?.toString() ?? DEFAULT_PAGE_SIZE.toString());

    router.push(`/dashboard/logs?${query.toString()}`);
  };

  // 处理分页
  const handlePageChange = (page: number) => {
    const query = new URLSearchParams(params.toString());
    query.set("page", page.toString());
    router.push(`/dashboard/logs?${query.toString()}`);
  };

  const handlePageSizeChange = (size: number) => {
    const query = new URLSearchParams(params.toString());
    query.set("pageSize", size.toString());
    query.set("page", "1");
    router.push(`/dashboard/logs?${query.toString()}`);
  };

  const summary = data?.summary;
  const totalCacheTokens =
    summary?.totalCacheCreationTokens && summary?.totalCacheReadTokens
      ? summary.totalCacheCreationTokens + summary.totalCacheReadTokens
      : 0;
  const summarySection = summary ? (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card className="rounded-2xl border border-border/60 bg-gradient-to-br from-card to-card/80 shadow-[0_10px_20px_rgba(15,23,42,0.05)] transition-all hover:-translate-y-0.5">
        <CardContent className="p-3.5 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">总请求数</p>
              <p className="text-[22px] font-semibold tracking-tight sm:text-[26px]">
                {summary.totalRequests.toLocaleString()}
                <span className="ml-1 text-sm font-normal text-muted-foreground">次</span>
              </p>
              <p className="text-xs text-muted-foreground">今日所有 API 调用</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted/40 text-orange-500">
              <Activity className="h-4 w-4" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-border/60 bg-gradient-to-br from-card to-card/80 shadow-[0_10px_20px_rgba(15,23,42,0.05)] transition-all hover:-translate-y-0.5">
        <CardContent className="p-3.5 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">总消耗金额</p>
              <p className="text-[22px] font-semibold tracking-tight text-green-600 sm:text-[26px] dark:text-green-400">
                {formatCurrency(summary.totalCost, currencyCode)}
              </p>
              <p className="text-xs text-muted-foreground">含缓存读写成本</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted/40 text-emerald-500">
              <Coins className="h-4 w-4" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-border/60 bg-gradient-to-br from-card to-card/80 shadow-[0_10px_20px_rgba(15,23,42,0.05)] transition-all hover:-translate-y-0.5">
        <CardContent className="space-y-2.5 p-3.5 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">总 Token 数</p>
              <p className="text-[22px] font-semibold tracking-tight text-purple-600 sm:text-[26px] dark:text-purple-400">
                {formatTokenAmount(summary.totalTokens)}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted/40 text-purple-500">
              <SquareStack className="h-4 w-4" />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-full bg-muted/50 px-2.5 py-0.5 text-muted-foreground">
              输入 <span className="font-mono font-medium text-foreground">{formatTokenAmount(summary.totalInputTokens)}</span>
            </span>
            <span className="rounded-full bg-muted/50 px-2.5 py-0.5 text-muted-foreground">
              输出 <span className="font-mono font-medium text-foreground">{formatTokenAmount(summary.totalOutputTokens)}</span>
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-border/60 bg-gradient-to-br from-card to-card/80 shadow-[0_10px_20px_rgba(15,23,42,0.05)] transition-all hover:-translate-y-0.5">
        <CardContent className="space-y-2.5 p-3.5 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">缓存 Token</p>
              <p className="text-[22px] font-semibold tracking-tight text-orange-500 sm:text-[26px]">
                {formatTokenAmount(totalCacheTokens)}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted/40 text-amber-500">
              <HardDrive className="h-4 w-4" />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-full bg-muted/50 px-2.5 py-0.5 text-muted-foreground">
              写入 <span className="font-mono font-medium text-foreground">{formatTokenAmount(summary.totalCacheCreationTokens)}</span>
            </span>
            <span className="rounded-full bg-muted/50 px-2.5 py-0.5 text-muted-foreground">
              读取 <span className="font-mono font-medium text-foreground">{formatTokenAmount(summary.totalCacheReadTokens)}</span>
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  ) : null;

  const filtersSection = (
    <Card className="rounded-2xl border border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">筛选条件</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          精确定位想要查看的请求范围
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2">
        <UsageLogsFilters
          isAdmin={isAdmin}
          isChildKeyView={isChildKeyView}
          users={users}
          providers={providers}
          initialKeys={initialKeys}
          filters={filters}
          onChange={handleFilterChange}
          onReset={() => router.push(`/dashboard/logs?date=${formatDate(getTodayDate())}`)}
        />
      </CardContent>
    </Card>
  );

  const tableSection = (
    <Card className="shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">使用记录</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              disabled={isPending}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isManualRefreshing ? "animate-spin" : ""}`} />
              刷新
            </Button>
            <Button
              variant={isAutoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setIsAutoRefresh(!isAutoRefresh)}
              className="gap-2"
            >
              {isAutoRefresh ? (
                <>
                  <Pause className="h-4 w-4" />
                  停止自动刷新
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  开启自动刷新
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="py-8 text-center text-destructive">{error}</div>
        ) : !data ? (
          <div className="py-8 text-center text-muted-foreground">加载中...</div>
        ) : (
        <UsageLogsTable
          isAdmin={isAdmin}
          logs={data.logs}
          total={data.total}
            page={filters.page || 1}
            pageSize={filters.pageSize || DEFAULT_PAGE_SIZE}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            pageSizeOptions={[20, 50, 100, 200]}
            isPending={isPending}
            newLogIds={newLogIds}
            currencyCode={currencyCode}
          />
        )}
      </CardContent>
    </Card>
  );

  const detailsView = (
    <div className="space-y-6">
      {summarySection}
      {filtersSection}
      {tableSection}
    </div>
  );

  if (isAdmin) {
    return detailsView;
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList className="w-fit rounded-full bg-muted/40 p-1">
        <TabsTrigger
          value="monthly"
          className="rounded-full px-4 py-1 text-sm text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg"
        >
          月度消费统计
        </TabsTrigger>
        <TabsTrigger
          value="details"
          className="rounded-full px-4 py-1 text-sm text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg"
        >
          消费明细记录
        </TabsTrigger>
      </TabsList>
      <TabsContent value="monthly">
        <MonthlyUsageView currencyCode={currencyCode} />
      </TabsContent>
      <TabsContent value="details">{detailsView}</TabsContent>
    </Tabs>
  );
}
