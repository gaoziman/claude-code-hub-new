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
      <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-border/60 bg-card/80 p-1 shadow-inner">
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
                "flex min-w-[88px] flex-col items-center justify-center rounded-full px-4 py-2 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60",
                active
                  ? "bg-primary text-primary-foreground shadow-[0_12px_28px_rgba(15,23,42,0.18)]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span
                className={cn(
                  "text-[11px] font-medium tracking-wide",
                  active ? "text-primary-foreground/80" : "text-muted-foreground/80"
                )}
              >
                {option.description}
              </span>
              <span
                className={cn(
                  "text-base font-semibold leading-tight",
                  active ? "text-primary-foreground" : "text-foreground"
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
