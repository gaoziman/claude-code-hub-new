"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  RefreshCcw,
  ScanEye,
  Shield,
  TrendingUp,
} from "lucide-react";

import { checkConsistency, getLatestCheckResult } from "../_actions/check";
import { globalRebuildCache, fixAllInconsistencies } from "../_actions/fix";
import { getTaskConfig, updateTaskConfig, getTaskStatus } from "../_actions/config";
import type {
  ConsistencyCheckResult,
  ConsistencyTaskConfig,
  TaskStatus,
} from "@/types/consistency";
import { StatisticsCards } from "./statistics-cards";
import { InconsistencyTable } from "./inconsistency-table";
import { EmptyState } from "./empty-state";
import { HistoryGlance } from "./history-glance";
import { cn } from "@/lib/utils";
import { getTaskStatusBadge } from "./task-status-utils";

export function OverviewTab() {
  const [checkResult, setCheckResult] = useState<ConsistencyCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isFixingAll, setIsFixingAll] = useState(false);
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(false);
  const [showRebuildDialog, setShowRebuildDialog] = useState(false);
  const [taskConfig, setTaskConfig] = useState<ConsistencyTaskConfig | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  const healthScore = useMemo(() => {
    if (!checkResult) {
      return 72;
    }
    const total = Math.max(checkResult.totalKeysChecked || 1, 1);
    const inconsistencyRatio = checkResult.inconsistentCount / total;
    const differencePenalty = Math.min(40, Math.abs(checkResult.totalDifferenceUsd) * 4);
    const base = 100 - inconsistencyRatio * 120 - differencePenalty;
    return Math.max(5, Math.min(100, Math.round(base)));
  }, [checkResult]);

  const healthLevel = useMemo(() => {
    if (healthScore >= 90) {
      return { label: "优秀", badge: "bg-emerald-100 text-emerald-700" };
    }
    if (healthScore >= 70) {
      return { label: "良好", badge: "bg-amber-100 text-amber-700" };
    }
    return { label: "需关注", badge: "bg-rose-100 text-rose-700" };
  }, [healthScore]);

  const quickStats = useMemo(() => {
    return [
      {
        label: "待修复项",
        value: checkResult ? checkResult.inconsistentCount.toString() : "--",
        desc: checkResult ? `巡检 Key ${checkResult.totalKeysChecked}` : "暂无巡检数据",
        progress:
          checkResult && checkResult.totalKeysChecked
            ? Math.min(
                100,
                (checkResult.inconsistentCount / Math.max(checkResult.totalKeysChecked, 1)) *
                  100 *
                  4
              )
            : 15,
        accent: "from-orange-400 to-orange-600",
      },
      {
        label: "差异额 (USD)",
        value: checkResult ? `$${checkResult.totalDifferenceUsd.toFixed(4)}` : "--",
        desc: "相对阈值的超出金额",
        progress: Math.min(100, Math.abs(checkResult?.totalDifferenceUsd ?? 0) * 8),
        accent: "from-sky-400 to-sky-600",
      },
      {
        label: "平均差异率",
        value: checkResult ? `${checkResult.averageDifferenceRate.toFixed(1)}%` : "--",
        desc: "Redis ↔ DB 的相对误差",
        progress: Math.min(100, (checkResult?.averageDifferenceRate ?? 0) * 3),
        accent: "from-indigo-400 to-indigo-600",
      },
      {
        label: "自动巡检",
        value: autoCheckEnabled ? `每 ${taskConfig?.intervalHours ?? "-"} 小时` : "未启用",
        desc: taskConfig?.autoFix ? "超阈值自动修复" : "仅记录差异",
        progress: autoCheckEnabled ? 100 : 20,
        accent: "from-emerald-400 to-emerald-600",
      },
    ];
  }, [autoCheckEnabled, checkResult, taskConfig]);

  const topRisks = useMemo(() => {
    if (!checkResult) return [] as ConsistencyCheckResult["items"];
    return [...checkResult.items].sort((a, b) => b.differenceRate - a.differenceRate).slice(0, 3);
  }, [checkResult]);

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    const [latestResult, configResult, statusResult] = await Promise.all([
      getLatestCheckResult(),
      getTaskConfig(),
      getTaskStatus(),
    ]);

    if (latestResult.ok && latestResult.data) {
      setCheckResult(latestResult.data);
    }

    if (configResult.ok && configResult.data) {
      setTaskConfig(configResult.data);
      setAutoCheckEnabled(configResult.data.enabled);
    }

    if (statusResult.ok && statusResult.data) {
      setTaskStatus(statusResult.data);
    }
  }

  async function handleCheck() {
    setIsChecking(true);
    try {
      const result = await checkConsistency();
      if (result.ok && result.data) {
        setCheckResult(result.data);
        toast.success("检测完成", {
          description: `共检测 ${result.data.totalKeysChecked} 个 Key，发现 ${result.data.inconsistentCount} 个不一致项`,
        });
      } else if (!result.ok) {
        toast.error("检测失败", {
          description: result.error,
        });
      }
    } finally {
      setIsChecking(false);
    }
  }

  async function handleFixAll() {
    if (!checkResult || checkResult.items.length === 0) {
      return;
    }

    setIsFixingAll(true);
    try {
      const result = await fixAllInconsistencies(checkResult.items);
      if (result.ok && result.data) {
        toast.success("修复完成", {
          description: `成功修复 ${result.data.fixed} 个不一致项`,
        });
        await handleCheck();
      } else if (!result.ok) {
        toast.error("修复失败", {
          description: result.error,
        });
      }
    } finally {
      setIsFixingAll(false);
    }
  }

  async function handleGlobalRebuild() {
    try {
      const result = await globalRebuildCache();
      if (result.ok) {
        toast.success("重建完成", {
          description: "缓存已清空，下次请求时会自动重建",
        });
        setCheckResult(null);
      } else {
        toast.error("重建失败", {
          description: result.error,
        });
      }
    } finally {
      setShowRebuildDialog(false);
    }
  }

  async function handleToggleAutoCheck(enabled: boolean) {
    setAutoCheckEnabled(enabled);
    const result = await updateTaskConfig({ enabled });
    if (!result.ok) {
      setAutoCheckEnabled(!enabled);
      toast.error("更新失败", {
        description: result.error,
      });
    }
  }

  async function handleRefreshTaskStatus() {
    setIsLoadingStatus(true);
    const statusResult = await getTaskStatus();
    if (statusResult.ok && statusResult.data) {
      setTaskStatus(statusResult.data);
    }
    setIsLoadingStatus(false);
  }

  const hasInconsistencies = checkResult && checkResult.inconsistentCount > 0;
  const statusBadge = useMemo(() => {
    if (!checkResult) {
      return {
        label: "等待检测",
        className: "border-primary/30 text-primary",
      };
    }
    if (hasInconsistencies) {
      return {
        label: `发现 ${checkResult.inconsistentCount} 项`,
        className: "border-red-200 bg-red-500/10 text-red-600",
      };
    }
    return {
      label: "状态良好",
      className: "border-emerald-300 bg-emerald-500/10 text-emerald-700",
    };
  }, [checkResult, hasInconsistencies]);

  const schedulerMetrics = useMemo(
    () => [
      {
        label: "检测间隔",
        value: taskStatus ? `每 ${taskStatus.intervalHours} 小时` : "--",
      },
      {
        label: "上次运行",
        value: taskStatus?.lastRun ? new Date(taskStatus.lastRun).toLocaleString() : "从未运行",
      },
      {
        label: "下次运行",
        value: taskStatus?.nextRun ? new Date(taskStatus.nextRun).toLocaleString() : "未排程",
      },
      {
        label: "上次发现异常",
        value: taskStatus?.lastRunResult
          ? `${taskStatus.lastRunResult.inconsistenciesFound} 项`
          : "暂无数据",
      },
      {
        label: "自动修复",
        value: taskConfig?.autoFix ? "触发后自动修复" : "仅记录不一致",
      },
      {
        label: "阈值策略",
        value: taskConfig
          ? `$${taskConfig.thresholdUsd.toFixed(2)} · ${taskConfig.thresholdRate.toFixed(1)}%`
          : "--",
      },
    ],
    [taskConfig, taskStatus]
  );
  const taskStatusMeta = getTaskStatusBadge(taskStatus);

  const alertSummary = useMemo(() => {
    return {
      lastCheck: checkResult ? new Date(checkResult.timestamp).toLocaleString() : "尚未检测",
      pending: checkResult ? `${checkResult.inconsistentCount} 条不一致` : "暂无待办",
      auto: autoCheckEnabled
        ? `自动巡检开启 · 每 ${taskConfig?.intervalHours ?? "-"} 小时`
        : "自动巡检关闭 · 建议开启",
    };
  }, [autoCheckEnabled, checkResult, taskConfig]);

  return (
    <div className="space-y-8">
      {(checkResult || taskConfig) && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs text-amber-900">
          <span className="inline-flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            一致性提醒
          </span>
          <span>最新检测：{alertSummary.lastCheck}</span>
          <span>待处理：{alertSummary.pending}</span>
          <span>{alertSummary.auto}</span>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-amber-300"
              onClick={handleCheck}
            >
              再次检测
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-amber-300"
              onClick={handleFixAll}
              disabled={!hasInconsistencies || isFixingAll}
            >
              {isFixingAll ? "修复中..." : "批量修复"}
            </Button>
          </div>
        </div>
      )}

      <section className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Health Index
              </span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  healthLevel.badge
                )}
              >
                {healthLevel.label}
              </span>
              <Badge
                variant="outline"
                className={cn("rounded-full px-2.5 py-0.5", statusBadge.className)}
              >
                <Shield className="mr-1 h-3.5 w-3.5" />
                {statusBadge.label}
              </Badge>
            </div>
            <div className="flex items-end gap-3">
              <span className="text-4xl font-semibold leading-none">{healthScore}</span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              基于最近一次巡检的差异率、差额和修复情况得出的综合指数，越高代表整体一致性越好。
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={handleCheck}
                disabled={isChecking}
                className="rounded-full px-4"
              >
                <ScanEye className="h-4 w-4" />
                {isChecking ? "检测中..." : "再次检测"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowRebuildDialog(true)}
                className="rounded-full px-4"
              >
                全局重建
              </Button>
              <div className="flex items-center gap-2 rounded-full border border-dashed border-primary/30 px-4 py-1 text-sm">
                <span className="text-xs text-muted-foreground">自动巡检</span>
                <span className="font-semibold text-foreground">
                  {autoCheckEnabled ? `每 ${taskConfig?.intervalHours ?? "-"} 小时` : "未启用"}
                </span>
                <Switch checked={autoCheckEnabled} onCheckedChange={handleToggleAutoCheck} />
              </div>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {quickStats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border bg-muted/10 p-3">
                <div className="text-xs text-muted-foreground">{stat.label}</div>
                <p className="mt-1 text-xl font-semibold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.desc}</p>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full bg-gradient-to-r", stat.accent)}
                    style={{ width: `${Math.max(5, Math.min(100, stat.progress))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.6fr,1fr]">
        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Risk Watch</p>
              <h3 className="mt-2 text-xl font-semibold">高风险 Key</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-muted-foreground"
              onClick={handleCheck}
            >
              <TrendingUp className="mr-1 h-4 w-4" />
              刷新数据
            </Button>
          </div>
          <div className="mt-5 space-y-4">
            {topRisks.length > 0 ? (
              topRisks.map((risk) => (
                <div
                  key={`${risk.keyId}-${risk.dimension}`}
                  className="rounded-2xl border border-border/60 bg-muted/10 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{risk.keyName}</p>
                      <p className="text-xs text-muted-foreground">维度 · {risk.dimension}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className="rounded-full border-amber-300 bg-amber-50 text-amber-700"
                    >
                      差异率 {risk.differenceRate.toFixed(1)}%
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
                    <div>
                      <p>Redis</p>
                      <p className="font-mono text-sm text-foreground">
                        {risk.redisValue !== null ? `$${risk.redisValue.toFixed(4)}` : "--"}
                      </p>
                    </div>
                    <div>
                      <p>数据库</p>
                      <p className="font-mono text-sm text-foreground">
                        ${risk.databaseValue.toFixed(4)}
                      </p>
                    </div>
                    <div>
                      <p>差异</p>
                      <p className="font-mono text-sm text-rose-600">
                        ${risk.difference.toFixed(4)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                暂无异常 Key
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Strategy</p>
              <h3 className="mt-2 text-xl font-semibold">自动策略概览</h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => handleToggleAutoCheck(!autoCheckEnabled)}
            >
              {autoCheckEnabled ? "停用" : "启用"}
            </Button>
          </div>
          <div className="mt-6 space-y-4 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>巡检频率</span>
              <span className="font-semibold text-foreground">
                每 {taskConfig?.intervalHours ?? "--"} 小时
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>阈值策略</span>
              <span className="font-semibold text-foreground">
                {taskConfig
                  ? `$${taskConfig.thresholdUsd.toFixed(2)} · ${taskConfig.thresholdRate.toFixed(1)}%`
                  : "未配置"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>自动修复</span>
              <span className="font-semibold text-foreground">
                {taskConfig?.autoFix ? "差异触发后自动修复" : "需人工确认"}
              </span>
            </div>
            <div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4 text-xs text-primary">
              <CalendarDays className="mb-2 h-4 w-4" />
              {taskConfig?.updatedAt
                ? `策略更新：${new Date(taskConfig.updatedAt).toLocaleString()}`
                : "尚未设置策略"}
            </div>
          </div>
        </div>
      </section>

      {checkResult ? (
        <StatisticsCards result={checkResult} />
      ) : (
        <div className="rounded-3xl border border-dashed border-primary/20 p-12 text-center text-muted-foreground">
          <p className="text-lg font-medium text-foreground">暂未检测</p>
          <p className="mt-2">点击「再次检测」即可生成最新的态势数据。</p>
        </div>
      )}

      {(taskStatus || taskConfig) && (
        <section className="rounded-2xl border bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Scheduler</p>
              <p className="font-semibold">任务状态与阈值策略</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn("rounded-full px-2.5 py-0.5", taskStatusMeta.className)}
              >
                {taskStatusMeta.label}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshTaskStatus}
                disabled={isLoadingStatus}
                className="rounded-full"
              >
                <RefreshCcw className={cn("mr-1 h-4 w-4", isLoadingStatus && "animate-spin")} />
                {isLoadingStatus ? "刷新中" : "刷新"}
              </Button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
            {schedulerMetrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-xl border border-border/50 bg-muted/10 px-3 py-2"
              >
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  {metric.label}
                </p>
                <p className="font-semibold text-foreground">{metric.value}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.8fr,1fr]">
        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Incidents</p>
              <h3 className="mt-2 text-xl font-semibold">不一致详情</h3>
            </div>
            {checkResult && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={handleCheck}
              >
                <ArrowRight className="mr-1 h-4 w-4" />
                刷新数据
              </Button>
            )}
          </div>
          <div className="mt-6">
            {checkResult ? (
              checkResult.inconsistentCount > 0 ? (
                <InconsistencyTable items={checkResult.items} onRefresh={handleCheck} />
              ) : (
                <EmptyState timestamp={checkResult.timestamp} />
              )
            ) : (
              <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
                暂无检测数据
              </div>
            )}
          </div>
        </div>

        <HistoryGlance />
      </div>

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
