import type { TaskStatus } from "@/types/consistency";

export function getTaskStatusBadge(taskStatus: TaskStatus | null) {
  if (!taskStatus) {
    return {
      label: "未知",
      description: "等待刷新",
      className: "border-muted text-muted-foreground",
    };
  }

  if (taskStatus.isRunning) {
    return {
      label: "运行中",
      description: "后台正在巡检",
      className: "border-blue-300 bg-blue-500/10 text-blue-700",
    };
  }

  if (!taskStatus.enabled) {
    return {
      label: "已禁用",
      description: "未排程",
      className: "border-muted text-muted-foreground",
    };
  }

  return {
    label: "待执行",
    description: "已排程等待执行",
    className: "border-emerald-300 bg-emerald-500/10 text-emerald-700",
  };
}
