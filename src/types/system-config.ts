import type { CurrencyCode } from "@/lib/utils";

export interface SystemThemeConfig {
  baseColor: string;
  accentColor: string;
  neutralColor: string;
}

export interface ThemeVariableMap {
  "--primary": string;
  "--primary-foreground": string;
  "--ring": string;
  "--accent": string;
  "--accent-foreground": string;
  "--muted": string;
  "--muted-foreground": string;
  "--sidebar-primary": string;
  "--sidebar-primary-foreground": string;
  "--chart-1": string;
  "--chart-2": string;
  "--chart-3": string;
  "--chart-4": string;
  "--chart-5": string;
}

export interface ResolvedTheme {
  light: ThemeVariableMap;
  dark: ThemeVariableMap;
}

export const DEFAULT_THEME_CONFIG: SystemThemeConfig = {
  baseColor: "#FF8A00",
  accentColor: "#FFB347",
  neutralColor: "#FFE8CC",
};

export interface SystemSettings {
  id: number;
  siteTitle: string;
  allowGlobalUsageView: boolean;

  // 货币显示配置
  currencyDisplay: CurrencyCode;

  // 主题配置
  themeConfig: SystemThemeConfig;

  // 日志清理配置
  enableAutoCleanup?: boolean;
  cleanupRetentionDays?: number;
  cleanupSchedule?: string;
  cleanupBatchSize?: number;

  // 客户端版本检查配置
  enableClientVersionCheck: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateSystemSettingsInput {
  // 所有字段均为可选，支持部分更新
  siteTitle?: string;
  allowGlobalUsageView?: boolean;

  // 货币显示配置（可选）
  currencyDisplay?: CurrencyCode;

  // 主题配置（可选）
  themeBaseColor?: string;
  themeAccentColor?: string;
  themeNeutralColor?: string;

  // 日志清理配置（可选）
  enableAutoCleanup?: boolean;
  cleanupRetentionDays?: number;
  cleanupSchedule?: string;
  cleanupBatchSize?: number;

  // 客户端版本检查配置（可选）
  enableClientVersionCheck?: boolean;
}
