export type UsageTimeRangeValue = "today" | "last7" | "last30" | "all";

export interface UsageTimeRangeMeta {
  value: UsageTimeRangeValue;
  label: string; // 长标签（控件显示）
  shortLabel: string; // 用于“xx调用”文案
  description: string;
}

export interface UsageTimeRangeBounds extends UsageTimeRangeMeta {
  start?: Date;
  end?: Date;
}

export const USAGE_TIME_RANGE_META: UsageTimeRangeMeta[] = [
  { value: "today", label: "今日", shortLabel: "今日", description: "统计今天的数据" },
  { value: "last7", label: "最近7天", shortLabel: "近7天", description: "统计最近7天（含今天）" },
  {
    value: "last30",
    label: "最近30天",
    shortLabel: "近30天",
    description: "统计最近30天（含今天）",
  },
  { value: "all", label: "全部时间", shortLabel: "累计", description: "统计所有历史数据" },
];

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function resolveUsageTimeRange(value: UsageTimeRangeValue): UsageTimeRangeBounds {
  const meta =
    USAGE_TIME_RANGE_META.find((item) => item.value === value) ?? USAGE_TIME_RANGE_META[0];
  const todayStart = startOfToday();
  const end = new Date(todayStart);
  end.setDate(end.getDate() + 1); // 明日 00:00

  if (value === "today") {
    return { ...meta, start: todayStart, end };
  }

  if (value === "last7") {
    const start = new Date(todayStart);
    start.setDate(start.getDate() - 6);
    return { ...meta, start, end };
  }

  if (value === "last30") {
    const start = new Date(todayStart);
    start.setDate(start.getDate() - 29);
    return { ...meta, start, end };
  }

  // 全部时间：无 start/end 限制
  return { ...meta, start: undefined, end: undefined };
}
