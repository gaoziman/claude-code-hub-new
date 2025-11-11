import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProviderHealthReport } from "@/repository/provider-health";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">供应商健康评分</h1>
          <p className="text-sm text-muted-foreground">
            仅管理员可见，分析窗口：最近 {report.windowHours} 小时
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {WINDOW_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={`/dashboard/providers/health?window=${option.value}&sort=${sortKey}`}
              className={cn(
                "rounded-full px-3 py-1 text-sm",
                report.windowHours === option.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>平均成功率</CardTitle>
            <CardDescription>所有供应商平均值</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">
              {formatPercent(report.summary.averageSuccessRate)}
            </div>
            <p className="text-xs text-muted-foreground">
              共 {report.summary.providerCount} 个供应商参与统计
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>平均 P95 延迟</CardTitle>
            <CardDescription>高峰时响应速度</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">
              {report.summary.averageP95Latency
                ? formatLatency(report.summary.averageP95Latency)
                : "--"}
            </div>
            <p className="text-xs text-muted-foreground">数据来源：message_request 表</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>请求总量</CardTitle>
            <CardDescription>统计窗口内全部请求</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">
              {formatNumber(report.summary.totalRequests)}
            </div>
            <p className="text-xs text-muted-foreground">
              生成时间：{report.generatedAt.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">排序：</span>
        {SORT_OPTIONS.map((option) => (
          <Link
            key={option.value}
            href={`/dashboard/providers/health?window=${report.windowHours}&sort=${option.value}`}
            className={cn(
              "rounded-full px-3 py-1 text-sm",
              sortKey === option.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>供应商列表</CardTitle>
          <CardDescription>可按列排序，点击列头查看指标含义</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>供应商</TableHead>
                  <TableHead className="text-right">请求量</TableHead>
                  <TableHead className="text-right">成功率</TableHead>
                  <TableHead className="text-right">P95 延迟</TableHead>
                  <TableHead className="text-right">熔断次数</TableHead>
                  <TableHead className="text-right">成本波动</TableHead>
                  <TableHead className="text-right">健康指数</TableHead>
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
                {providers.map((provider) => (
                  <TableRow key={provider.providerId}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{provider.providerName}</span>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline">{provider.providerType}</Badge>
                          {provider.groupTag && (
                            <Badge variant="secondary">{provider.groupTag}</Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {provider.totalRequests.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatPercent(provider.successRate)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatLatency(provider.p95LatencyMs)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {provider.circuitEvents}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {provider.costStddev.toFixed(3)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-primary">
                      {provider.healthScore.toFixed(1)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
