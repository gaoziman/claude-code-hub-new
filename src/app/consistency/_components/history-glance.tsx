"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCcw } from "lucide-react";
import { getConsistencyHistory } from "../_actions/history";
import type { ConsistencyHistory } from "@/types/consistency";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function HistoryGlance() {
  const [history, setHistory] = useState<ConsistencyHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void loadHistory();
  }, []);

  async function loadHistory() {
    setIsLoading(true);
    const result = await getConsistencyHistory({ page: 1, pageSize: 5 });
    if (result.ok && result.data) {
      setHistory(result.data.items);
    }
    setIsLoading(false);
  }

  function getBadge(type: ConsistencyHistory["operationType"]) {
    const map: Record<ConsistencyHistory["operationType"], string> = {
      manual_check: "bg-blue-50 text-blue-600",
      scheduled_check: "bg-purple-50 text-purple-600",
      manual_fix: "bg-orange-50 text-orange-600",
      auto_fix: "bg-emerald-50 text-emerald-600",
      global_rebuild: "bg-rose-50 text-rose-600",
    };
    return map[type] ?? "bg-muted text-muted-foreground";
  }

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">操作溯源快照</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={loadHistory} className="rounded-full">
          <RefreshCcw className={cn("mr-1 h-4 w-4", isLoading && "animate-spin")} />
          刷新
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中...
        </div>
      ) : history.length > 0 ? (
        <div className="mt-3 divide-y divide-muted/30 rounded-[20px] border border-muted/40 bg-muted/5">
          {history.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{item.operator}</span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      getBadge(item.operationType)
                    )}
                  >
                    {getOperationLabel(item.operationType)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  检测 {item.keysChecked} · 不一致 {item.inconsistenciesFound} · 修复{" "}
                  {item.itemsFixed || 0}
                </div>
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {new Date(item.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          暂无操作记录
        </div>
      )}
    </div>
  );
}

function getOperationLabel(type: ConsistencyHistory["operationType"]): string {
  const labels: Record<ConsistencyHistory["operationType"], string> = {
    manual_check: "手动检测",
    scheduled_check: "定时检测",
    manual_fix: "手动修复",
    auto_fix: "自动修复",
    global_rebuild: "全局重建",
  };
  return labels[type] ?? type;
}
