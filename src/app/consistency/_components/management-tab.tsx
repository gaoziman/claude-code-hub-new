"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { RefreshCcw, Play, AlertTriangle, Eye, Activity } from "lucide-react";

import {
  getTaskConfig,
  updateTaskConfig,
  getTaskStatus,
  triggerScheduledTask,
} from "../_actions/config";
import { globalRebuildCache } from "../_actions/fix";
import {
  getConsistencyHistory,
  getConsistencyHistoryDetail,
  getStatistics,
} from "../_actions/history";
import type {
  ConsistencyTaskConfig,
  TaskStatus,
  ConsistencyHistory,
  ConsistencyHistoryQuery,
  ConsistencyHistoryResponse,
} from "@/types/consistency";
import { cn } from "@/lib/utils";
import { getTaskStatusBadge } from "./task-status-utils";
import { DataPagination } from "@/components/data-pagination";

export function ManagementTab() {
  const [config, setConfig] = useState<ConsistencyTaskConfig | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTriggeringTask, setIsTriggeringTask] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [showRebuildDialog, setShowRebuildDialog] = useState(false);

  // 历史记录状态
  const [historyData, setHistoryData] = useState<ConsistencyHistoryResponse | null>(null);
  const [statistics, setStatistics] = useState<{
    totalChecks: number;
    totalInconsistencies: number;
    totalFixed: number;
    fixRate: number;
  } | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ConsistencyHistory | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  // 表单数据
  const [formData, setFormData] = useState({
    enabled: false,
    intervalHours: 6 as 1 | 3 | 6 | 12 | 24,
    autoFix: false,
    thresholdUsd: 0.01,
    thresholdRate: 5.0,
  });

  // 查询参数
  const [query, setQuery] = useState<ConsistencyHistoryQuery>({
    page: 1,
    pageSize: 20,
  });

  const loadTaskStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const statusResult = await getTaskStatus();
      if (statusResult.ok && statusResult.data) {
        setTaskStatus(statusResult.data);
      }
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    const configResult = await getTaskConfig();
    if (configResult.ok && configResult.data) {
      setConfig(configResult.data);
      setFormData({
        enabled: configResult.data.enabled,
        intervalHours: configResult.data.intervalHours,
        autoFix: configResult.data.autoFix,
        thresholdUsd: configResult.data.thresholdUsd,
        thresholdRate: configResult.data.thresholdRate,
      });
    }
    await loadTaskStatus();
  }, [loadTaskStatus]);

  const loadHistory = useCallback(async () => {
    setIsLoadingHistory(true);
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
      setIsLoadingHistory(false);
    }
  }, [query]);

  const loadStatistics = useCallback(async () => {
    const result = await getStatistics(7);
    if (result.ok && result.data) {
      setStatistics(result.data);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    void loadStatistics();
  }, [loadConfig, loadStatistics]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function handleSave() {
    setIsSaving(true);
    try {
      const result = await updateTaskConfig({
        enabled: formData.enabled,
        intervalHours: formData.intervalHours,
        autoFix: formData.autoFix,
        thresholdUsd: formData.thresholdUsd,
        thresholdRate: formData.thresholdRate,
      });

      if (result.ok && result.data) {
        setConfig(result.data);
        toast.success("保存成功", {
          description: "定时任务配置已更新",
        });
        await loadTaskStatus();
      } else if (!result.ok) {
        toast.error("保存失败", {
          description: result.error,
        });
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTriggerTask() {
    setIsTriggeringTask(true);
    try {
      const result = await triggerScheduledTask();
      if (result.ok) {
        toast.success("触发成功", {
          description: "定时任务已手动触发，正在后台执行",
        });
        setTimeout(() => {
          void loadTaskStatus();
          void loadHistory();
        }, 1000);
      } else {
        toast.error("触发失败", {
          description: result.error,
        });
      }
    } finally {
      setIsTriggeringTask(false);
    }
  }

  async function handleGlobalRebuild() {
    try {
      const result = await globalRebuildCache();
      if (result.ok) {
        toast.success("重建完成", {
          description: "缓存已清空，下次请求时会自动重建",
        });
      } else {
        toast.error("重建失败", {
          description: result.error,
        });
      }
    } finally {
      setShowRebuildDialog(false);
    }
  }

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

  const taskStatusBadge = getTaskStatusBadge(taskStatus);

  const operationTypeLabels: Record<string, string> = {
    manual_check: "手动检测",
    scheduled_check: "定时检测",
    manual_fix: "手动修复",
    auto_fix: "自动修复",
    global_rebuild: "全局重建",
  };

  return (
    <div className="space-y-8">
      {/* 任务状态监控 */}
      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Task Monitor
            </p>
            <h3 className="mt-2 text-xl font-semibold">定时任务状态</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn("rounded-full px-2.5 py-0.5", taskStatusBadge.className)}
            >
              {taskStatusBadge.label}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={loadTaskStatus}
              disabled={isLoadingStatus}
              className="rounded-full"
            >
              <RefreshCcw className={cn("mr-1 h-4 w-4", isLoadingStatus && "animate-spin")} />
              {isLoadingStatus ? "刷新中" : "刷新"}
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border bg-muted/10 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">状态</p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {taskStatus?.enabled ? "已启用" : "已停用"}
            </p>
          </div>
          <div className="rounded-2xl border bg-muted/10 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">上次运行</p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {taskStatus?.lastRun ? new Date(taskStatus.lastRun).toLocaleString() : "从未运行"}
            </p>
          </div>
          <div className="rounded-2xl border bg-muted/10 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">下次运行</p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {taskStatus?.nextRun ? new Date(taskStatus.nextRun).toLocaleString() : "未排程"}
            </p>
          </div>
          <div className="rounded-2xl border bg-muted/10 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              上次发现异常
            </p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {taskStatus?.lastRunResult ? `${taskStatus.lastRunResult.inconsistenciesFound} 项` : "--"}
            </p>
          </div>
        </div>
      </section>

      {/* 任务配置表单 */}
      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Configuration
            </p>
            <h3 className="mt-2 text-xl font-semibold">任务配置</h3>
          </div>
          <Button
            size="sm"
            onClick={handleTriggerTask}
            disabled={isTriggeringTask}
            className="rounded-full px-4"
          >
            <Play className="mr-1 h-4 w-4" />
            {isTriggeringTask ? "触发中..." : "立即执行"}
          </Button>
        </div>

        <div className="mt-6 space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="enabled">自动巡检</Label>
                <Switch
                  id="enabled"
                  checked={formData.enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                />
              </div>
              <p className="text-xs text-muted-foreground">启用定时自动检测数据一致性</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="intervalHours">检测间隔</Label>
              <Select
                value={formData.intervalHours.toString()}
                onValueChange={(value) =>
                  setFormData({ ...formData, intervalHours: parseInt(value) as 1 | 3 | 6 | 12 | 24 })
                }
              >
                <SelectTrigger id="intervalHours">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">每 1 小时</SelectItem>
                  <SelectItem value="3">每 3 小时</SelectItem>
                  <SelectItem value="6">每 6 小时</SelectItem>
                  <SelectItem value="12">每 12 小时</SelectItem>
                  <SelectItem value="24">每 24 小时</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="thresholdUsd">差异阈值 (USD)</Label>
              <Input
                id="thresholdUsd"
                type="number"
                step="0.01"
                min="0"
                value={formData.thresholdUsd}
                onChange={(e) =>
                  setFormData({ ...formData, thresholdUsd: parseFloat(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">差异超过此金额时触发警告</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="thresholdRate">差异阈值 (%)</Label>
              <Input
                id="thresholdRate"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={formData.thresholdRate}
                onChange={(e) =>
                  setFormData({ ...formData, thresholdRate: parseFloat(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">差异率超过此百分比时触发警告</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="autoFix">自动修复</Label>
                <Switch
                  id="autoFix"
                  checked={formData.autoFix}
                  onCheckedChange={(checked) => setFormData({ ...formData, autoFix: checked })}
                />
              </div>
              <p className="text-xs text-muted-foreground">发现不一致时自动修复 Redis 缓存</p>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t pt-4">
            <Button variant="outline" onClick={loadConfig}>
              重置
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "保存中..." : "保存配置"}
            </Button>
          </div>
        </div>
      </section>

      {/* 统计卡片 */}
      {statistics && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">总检测次数</p>
            <p className="mt-2 text-3xl font-semibold">{statistics.totalChecks}</p>
            <p className="mt-1 text-xs text-muted-foreground">最近 7 天</p>
          </div>
          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">发现不一致</p>
            <p className="mt-2 text-3xl font-semibold text-amber-600">
              {statistics.totalInconsistencies}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">累计发现</p>
          </div>
          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">已修复项</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-600">{statistics.totalFixed}</p>
            <p className="mt-1 text-xs text-muted-foreground">累计修复</p>
          </div>
          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">修复率</p>
            <p className="mt-2 text-3xl font-semibold">{statistics.fixRate.toFixed(1)}%</p>
            <p className="mt-1 text-xs text-muted-foreground">自动修复比例</p>
          </div>
        </div>
      )}

      {/* 操作历史 */}
      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Operation History
            </p>
            <h3 className="mt-2 text-xl font-semibold">操作历史</h3>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={query.operationType || "all"}
              onValueChange={(value) =>
                setQuery({ ...query, page: 1, operationType: value === "all" ? undefined : value as any })
              }
            >
              <SelectTrigger className="w-[160px]">
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
              variant="outline"
              size="sm"
              onClick={loadHistory}
              disabled={isLoadingHistory}
            >
              <RefreshCcw className={cn("mr-1 h-4 w-4", isLoadingHistory && "animate-spin")} />
              刷新
            </Button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>操作类型</TableHead>
                <TableHead>检测数量</TableHead>
                <TableHead>发现不一致</TableHead>
                <TableHead>已修复</TableHead>
                <TableHead>总差异</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyData && historyData.items.length > 0 ? (
                historyData.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">
                      {new Date(item.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-full">
                        {operationTypeLabels[item.operationType] || item.operationType}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.keysChecked}</TableCell>
                    <TableCell>
                      {item.inconsistenciesFound > 0 ? (
                        <span className="font-semibold text-amber-600">
                          {item.inconsistenciesFound}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.itemsFixed > 0 ? (
                        <span className="font-semibold text-emerald-600">{item.itemsFixed}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      ${parseFloat(item.totalDifference).toFixed(4)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetail(item.id)}
                        className="rounded-full"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    暂无操作历史
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {historyData && historyData.total > 0 && (
          <div className="mt-4">
            <DataPagination
              page={query.page}
              pageSize={query.pageSize}
              total={historyData.total}
              onPageChange={(page) => setQuery({ ...query, page })}
              onPageSizeChange={(pageSize) => setQuery({ ...query, page: 1, pageSize })}
            />
          </div>
        )}
      </section>

      {/* 危险操作区 */}
      <section className="rounded-3xl border border-red-200 bg-red-50/50 p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <h3 className="text-xl font-semibold text-red-900">危险操作区</h3>
            </div>
            <p className="mt-2 text-sm text-red-700">
              以下操作会对系统产生重大影响，请谨慎操作
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowRebuildDialog(true)}
            className="rounded-full"
          >
            <Activity className="mr-1 h-4 w-4" />
            全局重建缓存
          </Button>
        </div>
        <div className="mt-4 rounded-2xl border border-red-300 bg-white p-4 text-sm text-red-800">
          <p className="font-medium">全局重建缓存操作说明：</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
            <li>将清空所有 key:*:cost_* 相关的 Redis 缓存</li>
            <li>下次请求时会自动从数据库重新计算并建立缓存</li>
            <li>执行期间可能导致短暂的响应延迟</li>
            <li>建议在业务低峰期执行此操作</li>
          </ul>
        </div>
      </section>

      {/* 详情对话框 */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>操作详情</DialogTitle>
            <DialogDescription>
              {selectedItem && new Date(selectedItem.timestamp).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">操作类型</p>
                  <p className="mt-1 text-sm">
                    {operationTypeLabels[selectedItem.operationType] || selectedItem.operationType}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">操作者</p>
                  <p className="mt-1 text-sm">{selectedItem.operator === "admin" ? "管理员" : "系统"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">检测 Key 数</p>
                  <p className="mt-1 text-sm">{selectedItem.keysChecked}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">发现不一致</p>
                  <p className="mt-1 text-sm">{selectedItem.inconsistenciesFound}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">已修复项</p>
                  <p className="mt-1 text-sm">{selectedItem.itemsFixed}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">总差异金额</p>
                  <p className="mt-1 font-mono text-sm">
                    ${parseFloat(selectedItem.totalDifference).toFixed(4)}
                  </p>
                </div>
              </div>
              {selectedItem.details && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">详细信息</p>
                  <pre className="mt-2 max-h-96 overflow-auto rounded-lg border bg-muted p-4 text-xs">
                    {JSON.stringify(selectedItem.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 全局重建确认对话框 */}
      <AlertDialog open={showRebuildDialog} onOpenChange={setShowRebuildDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认全局重建缓存？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将清空所有 key:*:cost_* 相关的 Redis 缓存，重新读取数据库以生成新缓存。
              <br />
              <strong className="text-destructive">此动作会带来短暂延迟，请确认业务窗口。</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleGlobalRebuild}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认重建
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
