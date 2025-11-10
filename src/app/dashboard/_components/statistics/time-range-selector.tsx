"use client";

import * as React from "react";
import { TIME_RANGE_OPTIONS, type TimeRange } from "@/types/statistics";
import { cn } from "@/lib/utils";

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (timeRange: TimeRange) => void;
  className?: string;
  disabled?: boolean;
}

/**
 * 时间范围选择器组件
 * 提供今天、7天、30天的选择
 */
export function TimeRangeSelector({
  value,
  onChange,
  className,
  disabled = false,
}: TimeRangeSelectorProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-wrap items-center justify-center gap-3 border-t px-4 py-4 lg:ml-auto lg:w-auto lg:justify-end lg:border-t-0 lg:px-6",
        className
      )}
    >
      <div className="inline-flex flex-wrap items-center gap-2 rounded-3xl border border-border/60 bg-card/80 p-1.5 shadow-[0_10px_25px_rgba(15,23,42,0.08)] backdrop-blur-lg">
        {TIME_RANGE_OPTIONS.map((option) => {
          const active = value === option.key;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => !disabled && onChange(option.key)}
              title={option.description}
              className={cn(
                "group flex min-w-[86px] flex-col rounded-2xl px-3.5 py-2 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60",
                active
                  ? "border border-transparent bg-gradient-to-r from-[#ff8f3f] via-[#ff7a45] to-[#ff5f5f] text-white shadow-lg shadow-primary/30"
                  : "border border-transparent bg-transparent text-foreground hover:border-border/60 hover:bg-white/70"
              )}
            >
              <span
                className={cn(
                  "text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80 transition-colors",
                  active && "text-white/90"
                )}
              >
                {option.description}
              </span>
              <span
                className={cn(
                  "text-base font-semibold text-foreground transition-colors",
                  active && "text-white"
                )}
              >
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
