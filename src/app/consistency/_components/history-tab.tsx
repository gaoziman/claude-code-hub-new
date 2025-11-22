"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getConsistencyHistory,
  getConsistencyHistoryDetail,
  getStatistics,
} from "../_actions/history";
import type {
  ConsistencyHistory,
  ConsistencyHistoryQuery,
  ConsistencyHistoryResponse,
} from "@/types/consistency";
import { DataPagination } from "@/components/data-pagination";

export function HistoryTab() {
  const [historyData, setHistoryData] = useState<ConsistencyHistoryResponse | null>(null);
  const [statistics, setStatistics] = useState<{
    totalChecks: number;
    totalInconsistencies: number;
    totalFixed: number;
    fixRate: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ConsistencyHistory | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  // 查询参数
  const [query, setQuery] = useState<ConsistencyHistoryQuery>({
    page: 1,
    pageSize: 20,
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getConsistencyHistory(query);
      if (result.ok && result.data) {
        setHistoryData(result.data);
      } else if (!result.ok) {
        toast.error("加载失败", {
          description: result.error,
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  // 加载数据
  useEffect(() => {
    loadData();
  }, [loadData]);

  // 加载统计数据
  useEffect(() => {
    loadStatistics();
  }, []);

  async function loadStatistics() {
    const result = await getStatistics(7);
    if (result.ok && result.data) {
      setStatistics(result.data);
    }
  }

  // 查看详情
  async function handleViewDetail(id: number) {
    const result = await getConsistencyHistoryDetail(id);
    if (result.ok && result.data) {
      setSelectedItem(result.data);
      setShowDetailDialog(true);
    } else if (!result.ok) {
      toast.error("获取详情失败", {
        description: result.error,
      });
    }
  }

  // 获取操作类型标签
  function getOperationTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      manual_check: "手动检测",
      scheduled_check: "定时检测",
      manual_fix: "手动修复",
      auto_fix: "自动修复",
      global_rebuild: "全局重建",
    };
    return labels[type] || type;
  }

  // 获取操作类型颜色
  function getOperationTypeBadge(type: string) {
    const variants: Record<string, string> = {
      manual_check: "bg-blue-50 text-blue-600",
      scheduled_check: "bg-purple-50 text-purple-600",
      manual_fix: "bg-orange-50 text-orange-600",
      auto_fix: "bg-emerald-50 text-emerald-600",
      global_rebuild: "bg-rose-50 text-rose-600",
    };
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-3 py-0.5 text-xs font-semibold",
          variants[type] || "bg-muted text-foreground"
        )}
      >
        {getOperationTypeLabel(type)}
      </span>
    );
  }

  // 分页处理
  function handlePageChange(newPage: number) {
    setQuery({ ...query, page: newPage });
  }

  function handlePageSizeChange(newSize: number) {
    setQuery({ ...query, pageSize: newSize, page: 1 });
  }

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      {statistics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "总检测次数", value: statistics.totalChecks, desc: "最近 7 天" },
            { label: "发现不一致", value: statistics.totalInconsistencies, desc: "累计数量" },
            { label: "已修复项", value: statistics.totalFixed, desc: "累计修复" },
            {
              label: "修复率",
              value: `${statistics.fixRate.toFixed(1)}%`,
              desc: `${statistics.totalFixed} / ${statistics.totalInconsistencies}`,
            },
          ].map((item) => (
            <div key={item.label} className="rounded-md border bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-2 text-3xl font-semibold">{item.value}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      )}

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-4 rounded-md border border-border/50 bg-white/90 p-4 shadow-sm">
        <Select
          value={query.operationType || "all"}
          onValueChange={(value) =>
            setQuery({
              ...query,
              operationType:
                value === "all" ? undefined : (value as ConsistencyHistory["operationType"]),
              page: 1,
            })
          }
        >
          <SelectTrigger className="w-[200px] rounded-md border border-border/50 bg-muted/20 text-left">
            <SelectValue placeholder="操作类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="manual_check">手动检测</SelectItem>
            <SelectItem value="scheduled_check">定时检测</SelectItem>
            <SelectItem value="manual_fix">手动修复</SelectItem>
            <SelectItem value="auto_fix">自动修复</SelectItem>
            <SelectItem value="global_rebuild">全局重建</SelectItem>
          </SelectContent>
        </Select>

        <Button
          onClick={loadData}
          disabled={isLoading}
          variant="outline"
          size="sm"
          className="ml-auto rounded-full"
        >
          {isLoading ? "刷新中..." : "刷新列表"}
        </Button>
      </div>

      {/* 历史记录表格 */}
      <div className="overflow-hidden rounded-md border border-border/60 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20">
              <TableHead>操作类型</TableHead>
              <TableHead>操作者</TableHead>
              <TableHead className="text-right">检测数量</TableHead>
              <TableHead className="text-right">不一致数</TableHead>
              <TableHead className="text-right">已修复</TableHead>
              <TableHead className="text-right">总差异额</TableHead>
              <TableHead>时间</TableHead>
              <TableHead className="text-center">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historyData && historyData.items.length > 0 ? (
              historyData.items.map((item) => (
                <TableRow key={item.id} className="border-b border-muted/30 hover:bg-muted/10">
                  <TableCell>{getOperationTypeBadge(item.operationType)}</TableCell>
                  <TableCell>{item.operator}</TableCell>
                  <TableCell className="text-right">{item.keysChecked}</TableCell>
                  <TableCell className="text-right">
                    {item.inconsistenciesFound > 0 ? (
                      <span className="font-medium text-orange-600">
                        {item.inconsistenciesFound}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.itemsFixed > 0 ? (
                      <span className="font-medium text-green-600">{item.itemsFixed}</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.totalDifference !== "0" ? (
                      <span className="font-medium">
                        ${parseFloat(item.totalDifference).toFixed(4)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">$0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-xs text-muted-foreground">
                      {new Date(item.timestamp).toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full"
                      onClick={() => handleViewDetail(item.id)}
                    >
                      查看详情
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  {isLoading ? "加载中..." : "暂无操作历史"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* 分页 */}
      {historyData && historyData.total > 0 && (
        <div className="rounded-xl border border-border/60 bg-white p-4 shadow-sm">
          <DataPagination
            page={historyData.page}
            pageSize={historyData.pageSize}
            total={historyData.total}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            isDisabled={isLoading}
          />
        </div>
      )}

      {/* 详情对话框 */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>操作详情</DialogTitle>
            <DialogDescription>查看此次操作的详细信息</DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4">
              {/* 基本信息 */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">操作类型</div>
                  <div className="mt-1">{getOperationTypeBadge(selectedItem.operationType)}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">操作者</div>
                  <div className="mt-1">{selectedItem.operator}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">操作时间</div>
                  <div className="mt-1">{new Date(selectedItem.timestamp).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">检测数量</div>
                  <div className="mt-1 text-lg font-semibold">
                    {selectedItem.keysChecked} 个 Key
                  </div>
                </div>
              </div>

              {/* 检测结果 */}
              <div className="rounded-lg border p-4">
                <div className="mb-2 font-medium">检测结果</div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <div className="text-sm text-muted-foreground">不一致数</div>
                    <div className="text-2xl font-bold text-orange-600">
                      {selectedItem.inconsistenciesFound}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">已修复</div>
                    <div className="text-2xl font-bold text-green-600">
                      {selectedItem.itemsFixed}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">总差异额</div>
                    <div className="text-2xl font-bold">
                      ${parseFloat(selectedItem.totalDifference).toFixed(4)}
                    </div>
                  </div>
                </div>
              </div>

              {/* 详细数据 */}
              {selectedItem.details && (
                <div className="rounded-lg border p-4">
                  <div className="mb-2 font-medium">详细数据</div>
                  <pre className="max-h-[300px] overflow-auto rounded bg-muted p-4 text-xs">
                    {JSON.stringify(selectedItem.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
