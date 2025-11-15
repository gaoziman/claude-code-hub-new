"use client";
import type { ConsistencyCheckResult } from "@/types/consistency";
import { Activity, AlertTriangle, Coins, KeySquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatisticsCardsProps {
  result: ConsistencyCheckResult;
}

const CARD_META = [
  {
    key: "totalKeysChecked",
    label: "检测数量",
    icon: KeySquare,
    formatter: (value: number) => value.toString(),
    caption: "最新一次巡检 Key 数",
    accent: "from-sky-400 to-sky-600",
    progress: (result: ConsistencyCheckResult) =>
      Math.min(100, (result.totalKeysChecked / 500) * 100),
  },
  {
    key: "inconsistentCount",
    label: "发现异常",
    icon: AlertTriangle,
    formatter: (value: number) => value.toString(),
    caption: "需人工确认 / 自动修复",
    accent: "from-amber-400 to-amber-600",
    progress: (result: ConsistencyCheckResult) => Math.min(100, result.inconsistentCount * 10),
  },
  {
    key: "totalDifferenceUsd",
    label: "累计差额 (USD)",
    icon: Coins,
    formatter: (value: number) => `$${value.toFixed(4)}`,
    caption: "相对阈值的超出金额",
    accent: "from-emerald-400 to-emerald-600",
    progress: (result: ConsistencyCheckResult) =>
      Math.min(100, Math.abs(result.totalDifferenceUsd) * 8),
  },
  {
    key: "averageDifferenceRate",
    label: "平均差异率",
    icon: Activity,
    formatter: (value: number) => `${value.toFixed(1)}%`,
    caption: "Redis ↔ DB 的相对误差",
    accent: "from-indigo-400 to-indigo-600",
    progress: (result: ConsistencyCheckResult) => Math.min(100, result.averageDifferenceRate * 3),
  },
] as const;

export function StatisticsCards({ result }: StatisticsCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {CARD_META.map((card) => {
        const Icon = card.icon;
        const rawValue = result[card.key as keyof ConsistencyCheckResult] as number;
        const progress = card.progress ? card.progress(result) : 0;
        return (
          <div
            key={card.key}
            className="relative overflow-hidden rounded-3xl border bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)]"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    {card.label}
                  </p>
                  <p className="mt-2 text-3xl font-semibold">{card.formatter(Number(rawValue))}</p>
                </div>
                <div className="rounded-2xl bg-muted/30 p-3 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{card.caption}</p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full bg-gradient-to-r", card.accent)}
                  style={{ width: `${Math.max(5, Math.min(100, progress))}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
