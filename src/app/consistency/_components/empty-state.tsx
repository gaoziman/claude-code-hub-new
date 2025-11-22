"use client";

import { ShieldCheck } from "lucide-react";

interface EmptyStateProps {
  timestamp: Date;
}

export function EmptyState({ timestamp }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-emerald-200/60 bg-gradient-to-br from-emerald-500/10 to-emerald-500/0 p-10 text-center dark:border-emerald-800/60">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-md bg-emerald-500/15">
        <ShieldCheck className="h-8 w-8 text-emerald-600 dark:text-emerald-300" />
      </div>
      <h3 className="mt-4 text-xl font-semibold text-emerald-700 dark:text-emerald-200">
        数据完全一致
      </h3>
      <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-300">
        未发现 Redis ↔ 数据库之间的差异，维持在健康阈值内。
      </p>
      <p className="mt-3 text-xs uppercase tracking-[0.3em] text-emerald-500">
        最后检测 · {new Date(timestamp).toLocaleString()}
      </p>
    </div>
  );
}
