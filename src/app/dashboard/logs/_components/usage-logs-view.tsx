"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getUsageLogs } from "@/actions/usage-logs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    router.push(`/dashboard/logs?${query.toString()}`, { scroll: false });
  };

  const handlePageSizeChange = (size: number) => {
    const query = new URLSearchParams(params.toString());
    query.set("pageSize", size.toString());
    query.set("page", "1");
    router.push(`/dashboard/logs?${query.toString()}`, { scroll: false });
  };

  const summary = data?.summary;
  const totalCacheTokens =
    summary?.totalCacheCreationTokens && summary?.totalCacheReadTokens
      ? summary.totalCacheCreationTokens + summary.totalCacheReadTokens
      : 0;
  const summarySection = summary ? (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {/* 总请求数卡片 */}
      <div className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-orange-300 hover:shadow-md">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-slate-500">总请求数</p>
            <p className="text-3xl font-semibold text-slate-900">
              {summary.totalRequests.toLocaleString()}
            </p>
            <p className="text-xs text-slate-400">今日 API 调用次数</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50">
            <Activity className="h-5 w-5 text-orange-600" />
          </div>
        </div>
      </div>

      {/* 总消耗金额卡片 */}
      <div className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-slate-500">总消耗金额</p>
            <p className="text-3xl font-semibold text-slate-900">
              {formatCurrency(summary.totalCost, currencyCode)}
            </p>
            <p className="text-xs text-slate-400">包含缓存费用</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
            <Coins className="h-5 w-5 text-emerald-600" />
          </div>
        </div>
      </div>

      {/* 总Token数卡片 */}
      <div className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-purple-300 hover:shadow-md">
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs text-slate-500">总 Token 数</p>
              <p className="text-3xl font-semibold text-slate-900">
                {formatTokenAmount(summary.totalTokens)}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
              <SquareStack className="h-5 w-5 text-purple-600" />
            </div>
          </div>
          <div className="flex gap-2 text-xs">
            <div className="flex-1 rounded-md bg-slate-50 px-2 py-1.5 text-slate-600">
              输入: {formatTokenAmount(summary.totalInputTokens)}
            </div>
            <div className="flex-1 rounded-md bg-slate-50 px-2 py-1.5 text-slate-600">
              输出: {formatTokenAmount(summary.totalOutputTokens)}
            </div>
          </div>
        </div>
      </div>

      {/* 缓存Token卡片 */}
      <div className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-cyan-300 hover:shadow-md">
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs text-slate-500">缓存 Token</p>
              <p className="text-3xl font-semibold text-slate-900">
                {formatTokenAmount(totalCacheTokens)}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50">
              <HardDrive className="h-5 w-5 text-cyan-600" />
            </div>
          </div>
          <div className="flex gap-2 text-xs">
            <div className="flex-1 rounded-md bg-slate-50 px-2 py-1.5 text-slate-600">
              写入: {formatTokenAmount(summary.totalCacheCreationTokens)}
            </div>
            <div className="flex-1 rounded-md bg-slate-50 px-2 py-1.5 text-slate-600">
              读取: {formatTokenAmount(summary.totalCacheReadTokens)}
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  const filtersSection = (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900">筛选条件</h3>
        <p className="text-xs text-slate-500">选择查询范围和参数</p>
      </div>

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
    </div>
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
