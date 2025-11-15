"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck, Activity, TimerReset } from "lucide-react";
import { OverviewTab } from "./overview-tab";
import { TaskConfigTab } from "./task-config-tab";
import { HistoryTab } from "./history-tab";
import { cn } from "@/lib/utils";

const TAB_ITEMS = [
  {
    value: "overview",
    title: "态势洞察",
    description: "检测、修复、风险预警",
    step: "STEP 01",
    icon: ShieldCheck,
  },
  {
    value: "tasks",
    title: "任务编排",
    description: "定时策略、阈值、自动化",
    step: "STEP 02",
    icon: TimerReset,
  },
  {
    value: "history",
    title: "操作溯源",
    description: "执行记录、异常复盘",
    step: "STEP 03",
    icon: Activity,
  },
] as const;

export function ConsistencyDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          Consistency Control
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">数据一致性指挥中心</h1>
            <p className="text-sm text-muted-foreground">
              实时监控 Redis ↔ 数据库状态，联动检测、排障、修复、审计全链路，保障关键数据不偏离。
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-5">
        <TabsList className="flex flex-wrap gap-3 rounded-full border border-border/60 bg-muted/40 p-1 shadow-inner">
          {TAB_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border border-transparent px-5 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  "data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_8px_25px_rgba(37,99,235,0.35)]",
                  "data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground hover:bg-white/60"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.title}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="overview" className="space-y-8">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="tasks" className="space-y-8">
          <TaskConfigTab />
        </TabsContent>

        <TabsContent value="history" className="space-y-8">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
