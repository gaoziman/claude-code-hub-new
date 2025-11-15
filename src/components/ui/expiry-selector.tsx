"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDateTimeLocal } from "@/lib/utils/datetime";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface PresetOption {
  id: string;
  label: string;
  durationMs?: number;
  isNever?: boolean;
}

const PRESET_OPTIONS: PresetOption[] = [
  { id: "never", label: "永不过期", isNever: true },
  { id: "1h", label: "1 小时", durationMs: 1 * HOUR },
  { id: "3h", label: "3 小时", durationMs: 3 * HOUR },
  { id: "6h", label: "6 小时", durationMs: 6 * HOUR },
  { id: "12h", label: "12 小时", durationMs: 12 * HOUR },
  { id: "1d", label: "1 天", durationMs: 1 * DAY },
  { id: "7d", label: "7 天", durationMs: 7 * DAY },
  { id: "30d", label: "30 天", durationMs: 30 * DAY },
  { id: "90d", label: "90 天", durationMs: 90 * DAY },
  { id: "180d", label: "180 天", durationMs: 180 * DAY },
  { id: "365d", label: "365 天", durationMs: 365 * DAY },
];

const PRIMARY_PRESET_COUNT = 7;
const relativeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

interface ExpirySelectorProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  description?: string;
  allowNever?: boolean;
  disabled?: boolean;
}

export function ExpirySelector({
  value,
  onChange,
  label = "过期时间",
  description = "留空表示永不过期，超过设置时间后将自动停用。",
  allowNever = true,
  disabled = false,
}: ExpirySelectorProps) {
  const [showAllPresets, setShowAllPresets] = useState(false);
  const normalizedValue = value ?? "";

  const visiblePresets = useMemo(() => {
    const presets = allowNever ? PRESET_OPTIONS : PRESET_OPTIONS.filter((item) => !item.isNever);
    return showAllPresets ? presets : presets.slice(0, PRIMARY_PRESET_COUNT);
  }, [allowNever, showAllPresets]);

  const hasMorePresets = (allowNever ? PRESET_OPTIONS : PRESET_OPTIONS.filter((item) => !item.isNever)).length > PRIMARY_PRESET_COUNT;

  const activePresetId = useMemo(() => {
    if (!normalizedValue) {
      return allowNever ? "never" : "custom";
    }
    const date = new Date(normalizedValue);
    if (Number.isNaN(date.getTime())) {
      return "custom";
    }
    const diff = date.getTime() - Date.now();
    const tolerance = 60 * 1000;
    const matched = PRESET_OPTIONS.find((preset) => {
      if (preset.isNever || !preset.durationMs) return false;
      return Math.abs(diff - preset.durationMs) <= tolerance;
    });
    return matched?.id ?? "custom";
  }, [normalizedValue, allowNever]);

  const summary = useMemo(() => {
    if (!normalizedValue) {
      return {
        text: "当前设置为永不过期，涉及安全策略时请谨慎使用。",
        tone: "warning" as const,
      };
    }

    const date = new Date(normalizedValue);
    if (Number.isNaN(date.getTime())) {
      return { text: "已选择自定义日期。", tone: "muted" as const };
    }

    const diff = date.getTime() - Date.now();
    if (diff <= 0) {
      return { text: "所选时间已早于当前时间，提交后会立即过期。", tone: "danger" as const };
    }

    const days = Math.floor(diff / DAY);
    const hours = Math.floor((diff % DAY) / HOUR);
    const relativeParts = [];
    if (days > 0) {
      relativeParts.push(`${days} 天`);
    }
    if (hours > 0) {
      relativeParts.push(`${hours} 小时`);
    }
    if (relativeParts.length === 0) {
      relativeParts.push("不足 1 小时");
    }

    const relativeText = relativeParts.join(" ");
    return {
      text: `将在 ${relativeFormatter.format(date)}（约 ${relativeText} 后）失效。`,
      tone: diff < DAY ? "warning" : "muted",
    } as const;
  }, [normalizedValue]);

  const handlePresetSelect = (preset: PresetOption) => {
    if (disabled) return;
    if (preset.isNever) {
      onChange(null);
      return;
    }
    if (!preset.durationMs) {
      return;
    }
    const expires = new Date(Date.now() + preset.durationMs);
    onChange(formatDateTimeLocal(expires));
  };

  const handleCustomChange = (next: string) => {
    if (disabled) return;
    onChange(next || null);
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/10 p-4">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {visiblePresets.map((preset) => (
          <button
            type="button"
            key={preset.id}
            onClick={() => handlePresetSelect(preset)}
            disabled={disabled}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              activePresetId === preset.id
                ? "border-transparent bg-primary text-primary-foreground shadow"
                : "border-border/70 bg-white/80 text-muted-foreground hover:text-foreground",
              disabled && "pointer-events-none opacity-50"
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {hasMorePresets && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-center text-xs text-muted-foreground"
          onClick={() => setShowAllPresets((prev) => !prev)}
          disabled={disabled}
        >
          {showAllPresets ? "收起更多选项" : "更多有效期选项"}
          {showAllPresets ? (
            <ChevronUp className="ml-1 h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="ml-1 h-3.5 w-3.5" />
          )}
        </Button>
      )}

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">自定义日期</label>
        <Input
          type="datetime-local"
          value={normalizedValue}
          onChange={(event) => handleCustomChange(event.target.value)}
          disabled={disabled}
          className="rounded-xl"
        />
      </div>

      <div
        className={cn(
          "flex items-center gap-2 rounded-xl px-3 py-2 text-xs",
          summary.tone === "danger" && "bg-destructive/10 text-destructive",
          summary.tone === "warning" && "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200",
          summary.tone === "muted" && "bg-muted text-muted-foreground"
        )}
      >
        {summary.tone === "danger" || summary.tone === "warning" ? (
          <AlertTriangle className="h-4 w-4" />
        ) : (
          <CalendarDays className="h-4 w-4" />
        )}
        <span>{summary.text}</span>
      </div>
    </div>
  );
}
