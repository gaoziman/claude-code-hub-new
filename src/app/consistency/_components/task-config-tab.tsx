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
import { Badge } from "@/components/ui/badge";
import { RefreshCcw, Play, Settings2 } from "lucide-react";

import {
  getTaskConfig,
  updateTaskConfig,
  getTaskStatus,
  triggerScheduledTask,
} from "../_actions/config";
import type { ConsistencyTaskConfig, TaskStatus } from "@/types/consistency";
import { cn } from "@/lib/utils";
import { getTaskStatusBadge } from "./task-status-utils";

export function TaskConfigTab() {
  const [config, setConfig] = useState<ConsistencyTaskConfig | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTriggeringTask, setIsTriggeringTask] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  const [formData, setFormData] = useState({
    enabled: false,
    intervalHours: 6 as 1 | 3 | 6 | 12 | 24,
    autoFix: false,
    thresholdUsd: 0.01,
    thresholdRate: 5.0,
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

  const loadData = useCallback(async () => {
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

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

  async function handleTrigger() {
    setIsTriggeringTask(true);
    try {
      const result = await triggerScheduledTask();
      if (result.ok) {
        toast.success("任务已触发", {
          description: "后台正在执行一致性检测...",
        });
        setTimeout(() => {
          void loadTaskStatus();
        }, 2000);
      } else {
        toast.error("触发失败", {
          description: result.error,
        });
      }
    } finally {
      setIsTriggeringTask(false);
    }
  }

  const statusBadge = getTaskStatusBadge(taskStatus);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1.05fr,0.95fr]">
        <div className="rounded-2xl border border-border/60 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 text-sm lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Scheduler Monitor</p>
              <h3 className="text-xl font-semibold">任务状态</h3>
              <p className="text-xs text-muted-foreground">
                自动巡检与手动触发的执行摘要，便于掌控节奏和稳定性。
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className={cn("rounded-full px-3 py-1", statusBadge.className)}>
                {statusBadge.label}
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

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {renderMetric("任务状态", statusBadge.description)}
            {renderMetric(
              "检测间隔",
              taskStatus ? `每 ${taskStatus.intervalHours} 小时` : "--",
              "建议设置为 6 小时，成本与敏感度更平衡"
            )}
            {renderMetric(
              "上次运行",
              taskStatus?.lastRun ? new Date(taskStatus.lastRun).toLocaleString() : "从未运行"
            )}
            {renderMetric(
              "下次运行",
              taskStatus?.nextRun ? new Date(taskStatus.nextRun).toLocaleString() : "未安排"
            )}
            {renderMetric(
              "异常发现",
              taskStatus?.lastRunResult
                ? `${taskStatus.lastRunResult.inconsistenciesFound} 项`
                : "暂无数据",
              "统计最近一次巡检发现的异常数量"
            )}
            {renderMetric(
              "自动修复",
              taskStatus?.lastRunResult
                ? `${taskStatus.lastRunResult.itemsFixed} 项`
                : formData.autoFix
                ? "待执行"
                : "未开启",
              formData.autoFix ? "触发异常后自动尝试修复" : "开启自动修复以降低人工干预"
            )}
          </div>

          {taskStatus?.lastRunResult && (
            <div className="mt-4 rounded-xl bg-muted/30 p-4 text-xs text-muted-foreground">
              最近运行：{taskStatus.lastRun ? new Date(taskStatus.lastRun).toLocaleString() : "--"} · 检测
              {` ${taskStatus.lastRunResult.keysChecked} 项 / 发现 ${taskStatus.lastRunResult.inconsistenciesFound} 项 / 修复 ${taskStatus.lastRunResult.itemsFixed} 项`}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/5 to-transparent p-5 shadow-inner">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">定时任务</p>
                <p className="text-lg font-semibold">
                  {formData.enabled ? "已启用" : "未启用"}
                </p>
              </div>
              <Switch
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">自动修复</p>
                <p className="text-lg font-semibold">
                  {formData.autoFix ? "触发后自动修复" : "仅记录不一致"}
                </p>
              </div>
              <Switch
                checked={formData.autoFix}
                onCheckedChange={(checked) => setFormData({ ...formData, autoFix: checked })}
              />
            </div>

            <Button
              onClick={handleTrigger}
              disabled={isTriggeringTask}
              className="w-full rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Play className="mr-1 h-4 w-4" />
              {isTriggeringTask ? "触发中..." : "立即触发一次检测"}
            </Button>

            {taskStatus?.nextRun && (
              <p className="text-xs text-muted-foreground">
                下一次计划执行：{new Date(taskStatus.nextRun).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-muted/60 p-2">
            <Settings2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h4 className="text-lg font-semibold">策略配置</h4>
            <p className="text-sm text-muted-foreground">
              调整巡检频率与阈值，平衡性能与敏感度
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="interval">检测间隔</Label>
            <Select
              value={formData.intervalHours.toString()}
              onValueChange={(value) =>
                setFormData({ ...formData, intervalHours: Number(value) as 1 | 3 | 6 | 12 | 24 })
              }
            >
              <SelectTrigger id="interval" className="rounded-2xl">
                <SelectValue placeholder="选择检测间隔" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">每 1 小时</SelectItem>
                <SelectItem value="3">每 3 小时</SelectItem>
                <SelectItem value="6">每 6 小时</SelectItem>
                <SelectItem value="12">每 12 小时</SelectItem>
                <SelectItem value="24">每 24 小时</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              建议设置为 6 小时，避免频繁检测造成压力
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="threshold-usd">金额阈值 (USD)</Label>
            <Input
              id="threshold-usd"
              type="number"
              step="0.01"
              min="0"
              value={formData.thresholdUsd}
              onChange={(e) =>
                setFormData({ ...formData, thresholdUsd: parseFloat(e.target.value) || 0 })
              }
              className="rounded-2xl"
            />
            <p className="text-xs text-muted-foreground">
              差异金额低于此值的记录会自动忽略
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="threshold-rate">差异率阈值 (%)</Label>
            <Input
              id="threshold-rate"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={formData.thresholdRate}
              onChange={(e) =>
                setFormData({ ...formData, thresholdRate: parseFloat(e.target.value) || 0 })
              }
              className="rounded-2xl"
            />
            <p className="text-xs text-muted-foreground">
              适当提高阈值可减少低风险告警
            </p>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-dashed p-4">
            <div>
              <p className="text-sm text-muted-foreground">配置更新时间</p>
              <p className="mt-2 text-lg font-semibold">
                {config?.updatedAt ? new Date(config.updatedAt).toLocaleString() : "--"}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">保存后立即生效</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-4">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-2xl bg-orange-600 hover:bg-orange-700"
          >
            {isSaving ? "保存中..." : "保存配置"}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              config &&
              setFormData({
                enabled: config.enabled,
                intervalHours: config.intervalHours,
                autoFix: config.autoFix,
                thresholdUsd: config.thresholdUsd,
                thresholdRate: config.thresholdRate,
              })
            }
            className="rounded-2xl"
          >
            重置
          </Button>
        </div>
      </section>
    </div>
  );
}

function renderMetric(label: string, value: string, hint?: string) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/80 p-4 shadow-sm">
      <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
