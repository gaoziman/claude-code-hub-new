"use client";

import { useState, useTransition, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

const LOG_LEVELS: {
  value: LogLevel;
  label: string;
  description: string;
  detail: string;
}[] = [
  {
    value: "fatal",
    label: "Fatal",
    description: "仅致命错误",
    detail: "仅显示致命错误，日志最少，适合高负载生产环境",
  },
  {
    value: "error",
    label: "Error",
    description: "错误信息",
    detail: "记录所有错误事件，便于快速定位异常但不包含警告信息",
  },
  {
    value: "warn",
    label: "Warn",
    description: "警告 + 错误",
    detail: "输出警告（如限流触发、熔断器打开）以及所有错误，适合关注风险趋势",
  },
  {
    value: "info",
    label: "Info",
    description: "关键业务事件 + 警告 + 错误（推荐生产）",
    detail: "展示关键业务事件（供应商选择、Session 复用、价格同步）以及警告和错误",
  },
  {
    value: "debug",
    label: "Debug",
    description: "调试信息 + 所有级别（推荐开发）",
    detail: "包含详细调试信息与所有级别日志，排查问题时使用",
  },
  {
    value: "trace",
    label: "Trace",
    description: "极详细追踪 + 所有级别",
    detail: "记录最细粒度的追踪信息，包含全部上下文与执行细节",
  },
];

export function LogLevelForm() {
  const [currentLevel, setCurrentLevel] = useState<LogLevel>("info");
  const [selectedLevel, setSelectedLevel] = useState<LogLevel>("info");
  const [isPending, startTransition] = useTransition();

  // 获取当前日志级别
  useEffect(() => {
    fetch("/api/admin/log-level")
      .then((res) => res.json())
      .then((data) => {
        setCurrentLevel(data.level);
        setSelectedLevel(data.level);
      })
      .catch(() => {
        toast.error("获取日志级别失败");
      });
  }, []);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/log-level", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ level: selectedLevel }),
        });

        const result = await response.json();

        if (!response.ok) {
          toast.error(result.error || "设置失败");
          return;
        }

        setCurrentLevel(selectedLevel);
        toast.success(`日志级别已设置为: ${selectedLevel.toUpperCase()}`);
      } catch {
        toast.error("设置日志级别失败");
      }
    });
  };

  const selectedMeta = LOG_LEVELS.find((level) => level.value === selectedLevel);
  const currentMeta = LOG_LEVELS.find((level) => level.value === currentLevel);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">日志级别控制</p>
          <h3 className="text-2xl font-semibold leading-tight">
            {currentMeta?.label ?? currentLevel.toUpperCase()}
          </h3>
          <p className="text-sm text-muted-foreground">
            {currentMeta?.detail ?? "选择合适的日志级别以控制输出详细程度。"}
          </p>
        </div>
        <Badge
          variant="outline"
          className="rounded-full border-primary/30 bg-primary/5 px-4 py-1 text-sm font-semibold text-primary"
        >
          当前 {currentLevel.toUpperCase()}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <div className="space-y-3">
          <Label htmlFor="log-level" className="text-sm font-medium">
            选择新的日志级别
          </Label>
          <Select value={selectedLevel} onValueChange={(value) => setSelectedLevel(value as LogLevel)}>
            <SelectTrigger
              id="log-level"
              disabled={isPending}
              className="h-auto min-h-[56px] items-start rounded-2xl border-border/70 py-3"
            >
              <div className="flex w-full flex-col text-left leading-snug">
                <span className="text-sm font-semibold text-foreground">
                  {selectedMeta?.label ?? "选择日志级别"}
                </span>
                <span className="text-xs text-muted-foreground mt-0.5">
                  {selectedMeta?.description ?? "关键业务事件 + 警告 + 错误（推荐生产）"}
                </span>
              </div>
            </SelectTrigger>
            <SelectContent>
              {LOG_LEVELS.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  <div className="flex flex-col gap-0.5 text-left">
                    <span className="text-sm font-medium text-foreground">{level.label}</span>
                    <span className="text-xs text-muted-foreground">{level.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">调整日志级别后立即生效，无需重启服务。</p>
        </div>

        <div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4 text-sm text-primary">
          <p className="font-semibold">
            待切换：{selectedMeta?.label ?? selectedLevel.toUpperCase()}
          </p>
          <p className="mt-2 text-xs text-primary/80 leading-relaxed">
            {selectedMeta?.detail}
          </p>
          {selectedLevel !== currentLevel ? (
            <p className="mt-3 text-xs text-primary/70">
              保存后将从 <strong>{currentLevel.toUpperCase()}</strong> 切换到 <strong>{selectedLevel.toUpperCase()}</strong>。
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">当前即为该级别。</p>
          )}
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">日志级别说明</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {LOG_LEVELS.map((level) => (
            <div
              key={level.value}
              className={cn(
                "rounded-2xl border bg-background/80 p-4 text-sm shadow-sm transition-all",
                level.value === selectedLevel
                  ? "border-primary shadow-[0_10px_35px_rgba(37,99,235,0.15)]"
                  : "border-border/60"
              )}
            >
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>{level.label}</span>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {level.value === currentLevel && <span className="text-primary">当前</span>}
                  {level.value === selectedLevel && level.value !== currentLevel && (
                    <span className="text-primary/70">待切换</span>
                  )}
                </div>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{level.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {selectedLevel !== currentLevel && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          当前级别为 <strong>{currentLevel.toUpperCase()}</strong>，保存后将切换到 <strong>{selectedLevel.toUpperCase()}</strong>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending || selectedLevel === currentLevel}>
          {isPending ? "保存中..." : "保存设置"}
        </Button>
      </div>
    </form>
  );
}
