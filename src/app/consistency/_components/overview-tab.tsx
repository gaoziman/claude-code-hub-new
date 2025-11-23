"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ScanEye, Shield, TrendingUp } from "lucide-react";

import { checkConsistency, getLatestCheckResult } from "../_actions/check";
import { fixAllInconsistencies } from "../_actions/fix";
import { getTaskConfig, updateTaskConfig } from "../_actions/config";
import type { ConsistencyCheckResult, ConsistencyTaskConfig } from "@/types/consistency";
import { cn } from "@/lib/utils";

export function OverviewTab() {
  const [checkResult, setCheckResult] = useState<ConsistencyCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isFixingAll, setIsFixingAll] = useState(false);
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(false);
  const [taskConfig, setTaskConfig] = useState<ConsistencyTaskConfig | null>(null);

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
        label: "检测 Key 数",
        value: checkResult ? checkResult.totalKeysChecked.toString() : "--",
        desc: "本次检测的 Key 总数",
        progress: checkResult ? 100 : 15,
        accent: "from-blue-400 to-blue-600",
      },
      {
        label: "不一致项",
        value: checkResult ? checkResult.inconsistentCount.toString() : "--",
        desc: checkResult
          ? `占比 ${((checkResult.inconsistentCount / Math.max(checkResult.totalKeysChecked, 1)) * 100).toFixed(1)}%`
          : "暂无巡检数据",
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
        label: "总差异金额",
        value: checkResult ? `$${checkResult.totalDifferenceUsd.toFixed(4)}` : "--",
        desc: "Redis ↔ DB 差异总和",
        progress: Math.min(100, Math.abs(checkResult?.totalDifferenceUsd ?? 0) * 8),
        accent: "from-sky-400 to-sky-600",
      },
    ];
  }, [checkResult]);

  const topRisks = useMemo(() => {
    if (!checkResult) return [] as ConsistencyCheckResult["items"];
    return [...checkResult.items].sort((a, b) => b.differenceRate - a.differenceRate).slice(0, 3);
  }, [checkResult]);

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    const [latestResult, configResult] = await Promise.all([
      getLatestCheckResult(),
      getTaskConfig(),
    ]);

    if (latestResult.ok && latestResult.data) {
      setCheckResult(latestResult.data);
    }

    if (configResult.ok && configResult.data) {
      setTaskConfig(configResult.data);
      setAutoCheckEnabled(configResult.data.enabled);
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
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs text-amber-900">
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

      <section className="rounded-lg border bg-white p-5 shadow-sm">
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
              <div className="flex items-center gap-2 rounded-full border border-dashed border-primary/30 px-4 py-1 text-sm">
                <span className="text-xs text-muted-foreground">自动巡检</span>
                <span className="font-semibold text-foreground">
                  {autoCheckEnabled ? `每 ${taskConfig?.intervalHours ?? "-"} 小时` : "未启用"}
                </span>
                <Switch checked={autoCheckEnabled} onCheckedChange={handleToggleAutoCheck} />
              </div>
            </div>
          </div>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            {quickStats.map((stat) => (
              <div key={stat.label} className="rounded-md border bg-muted/10 p-3">
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

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Risk Watch</p>
            <h3 className="mt-2 text-xl font-semibold">高风险 Key 列表</h3>
            <p className="mt-1 text-sm text-muted-foreground">按差异率降序排列，最多显示前 3 项</p>
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
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {topRisks.length > 0 ? (
            topRisks.map((risk) => (
              <div
                key={`${risk.keyId}-${risk.dimension}`}
                className="rounded-md border border-border/60 bg-muted/10 p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{risk.keyName}</p>
                    <p className="text-xs text-muted-foreground">维度 · {risk.dimension}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className="ml-2 flex-shrink-0 rounded-full border-amber-300 bg-amber-50 text-amber-700"
                  >
                    {risk.differenceRate.toFixed(1)}%
                  </Badge>
                </div>
                <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Redis</span>
                    <span className="font-mono text-sm text-foreground">
                      {risk.redisValue !== null ? `$${risk.redisValue.toFixed(4)}` : "--"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>数据库</span>
                    <span className="font-mono text-sm text-foreground">
                      ${risk.databaseValue.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span>差异</span>
                    <span className="font-mono text-sm font-semibold text-rose-600">
                      ${risk.difference.toFixed(4)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full rounded-md border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
              暂无异常 Key，数据一致性良好
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
