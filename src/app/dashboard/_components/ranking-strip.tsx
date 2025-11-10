"use client";

import { cn } from "@/lib/utils";

export type RankingItem = {
  id: number | string;
  name: string;
  primary: string;
  secondary?: string;
  rank: number;
};

interface RankingStripProps {
  title: string;
  subtitle?: string;
  items: RankingItem[];
  className?: string;
}

export function RankingStrip({ title, subtitle, items, className }: RankingStripProps) {
  if (!items.length) {
    return null;
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span className="font-semibold">{title}</span>
        {subtitle ? (
          <span className="normal-case text-xs text-muted-foreground/80">{subtitle}</span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-stretch justify-center gap-3 lg:justify-center">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex min-w-[150px] max-w-[210px] flex-1 flex-col rounded-2xl border border-border/40 bg-white/90 px-4 py-2 text-xs shadow-sm backdrop-blur dark:bg-slate-900/70"
          >
            <div className="flex items-center justify-between gap-2 text-muted-foreground">
              <span className="truncate font-semibold text-foreground">
                #{item.rank} {item.name}
              </span>
              {item.secondary ? (
                <span className="text-[11px] text-muted-foreground">{item.secondary}</span>
              ) : null}
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground">{item.primary}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
