import type { ProviderType } from "./provider";

export type TimeRange = "today" | "7days" | "30days";

export interface TimeRangeConfig {
  label: string;
  key: TimeRange;
  resolution: "hour" | "day";
  description?: string;
}

export const TIME_RANGE_OPTIONS: TimeRangeConfig[] = [
  {
    label: "今天",
    key: "today",
    resolution: "hour",
    description: "今日用量",
  },
  {
    label: "7天",
    key: "7days",
    resolution: "day",
    description: "近七天",
  },
  {
    label: "30天",
    key: "30days",
    resolution: "day",
    description: "近三十天",
  },
];

export const DEFAULT_TIME_RANGE: TimeRange = "today";

export interface ChartDataItem {
  date: string;
  [key: string]: string | number;
}

export interface DatabaseStatRow {
  user_id: number;
  user_name: string;
  date: string;
  api_calls: number;
  total_cost: string | number | null;
}

export interface DatabaseUser {
  id: number;
  name: string;
}

export interface DatabaseKeyStatRow {
  key_id: number;
  key_name: string;
  date: string;
  api_calls: number;
  total_cost: string | number | null;
}

export interface DatabaseKey {
  id: number;
  name: string;
}

export interface StatisticsUser {
  id: number;
  name: string;
  dataKey: string;
}

export interface UserStatisticsData {
  chartData: ChartDataItem[];
  users: StatisticsUser[];
  timeRange: TimeRange;
  resolution: "hour" | "day";
  mode: "users" | "keys" | "mixed";
}

export interface ProviderTrendRow {
  provider_id: number;
  provider_name: string;
  date: string;
  api_calls: number;
  total_cost: string | number | null;
}

export interface ProviderTrendSeries {
  id: number;
  name: string;
  dataKey: string;
  totalCost: number;
  totalCalls: number;
}

export interface ProviderTrendData {
  chartData: ChartDataItem[];
  providers: ProviderTrendSeries[];
  providerType: ProviderType;
  days: number;
}

/**
 * API Keys 趋势相关类型
 */

// Key 级别的趋势数据行（从数据库查询返回）
export interface KeyTrendRow {
  key_id: number;
  key_name: string;
  date: string;
  api_calls: number;
  total_cost: string | number | null;
}

// Key 趋势系列（用于图表）
export interface KeyTrendSeries {
  id: number;
  name: string;
  dataKey: string;
  totalCost: number;
  totalCalls: number;
}

// Key 趋势数据（完整数据结构）
export interface KeyTrendData {
  chartData: ChartDataItem[];
  keys: KeyTrendSeries[];
  days: number;
}

/**
 * 用户趋势相关类型
 */

// 用户级别的趋势数据行（从数据库查询返回）
export interface UserTrendRow {
  user_id: number;
  user_name: string;
  date: string;
  api_calls: number;
  total_cost: string | number | null;
}

// 用户趋势系列（用于图表）
export interface UserTrendSeries {
  id: number;
  name: string;
  dataKey: string;
  totalCost: number;
  totalCalls: number;
}

// 用户趋势数据（完整数据结构）
export interface UserTrendData {
  chartData: ChartDataItem[];
  users: UserTrendSeries[];
  days: number;
}
