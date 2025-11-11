"use client";

import { useMemo, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveSystemSettings } from "@/actions/system-config";
import { toast } from "sonner";
import { CURRENCY_CONFIG } from "@/lib/utils";
import type { SystemSettings, SystemThemeConfig } from "@/types/system-config";
import type { CurrencyCode } from "@/lib/utils";
import { ThemeColorPicker } from "./theme-color-picker";
import { THEME_UPDATE_EVENT } from "@/components/theme/theme-hydrator";
import { DEFAULT_THEME_CONFIG } from "@/types/system-config";
import { ThemePreviewCard } from "./theme-preview-card";
import { Badge } from "@/components/ui/badge";
import { resolveTheme } from "@/lib/theme";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp } from "lucide-react";

interface SystemSettingsFormProps {
  initialSettings: Pick<
    SystemSettings,
    "siteTitle" | "allowGlobalUsageView" | "currencyDisplay" | "themeConfig"
  >;
}

export function SystemSettingsForm({ initialSettings }: SystemSettingsFormProps) {
  const [siteTitle, setSiteTitle] = useState(initialSettings.siteTitle);
  const [allowGlobalUsageView, setAllowGlobalUsageView] = useState(
    initialSettings.allowGlobalUsageView
  );
  const [currencyDisplay, setCurrencyDisplay] = useState<CurrencyCode>(
    initialSettings.currencyDisplay
  );
  const [themeConfig, setThemeConfig] = useState<SystemThemeConfig>(initialSettings.themeConfig);
  const [lastSavedTheme, setLastSavedTheme] = useState<SystemThemeConfig>(
    initialSettings.themeConfig
  );
  const [isThemeExpanded, setIsThemeExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleThemeColorChange = (key: keyof SystemThemeConfig, value: string) => {
    setThemeConfig((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const themeChanged = useMemo(() => {
    return (
      themeConfig.baseColor !== lastSavedTheme.baseColor ||
      themeConfig.accentColor !== lastSavedTheme.accentColor ||
      themeConfig.neutralColor !== lastSavedTheme.neutralColor
    );
  }, [themeConfig, lastSavedTheme]);

  const chartPalette = useMemo(() => {
    const resolved = resolveTheme(themeConfig).light;
    return ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"].map(
      (token) => resolved[token as keyof typeof resolved]
    );
  }, [themeConfig]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!siteTitle.trim()) {
      toast.error("站点标题不能为空");
      return;
    }

    startTransition(async () => {
      const result = await saveSystemSettings({
        siteTitle,
        allowGlobalUsageView,
        currencyDisplay,
        themeBaseColor: themeConfig.baseColor,
        themeAccentColor: themeConfig.accentColor,
        themeNeutralColor: themeConfig.neutralColor,
      });

      if (!result.ok) {
        toast.error(result.error || "保存失败");
        return;
      }

      if (result.data) {
        setSiteTitle(result.data.siteTitle);
        setAllowGlobalUsageView(result.data.allowGlobalUsageView);
        setCurrencyDisplay(result.data.currencyDisplay);
        setThemeConfig(result.data.themeConfig);
        setLastSavedTheme(result.data.themeConfig);
        window.dispatchEvent(
          new CustomEvent(THEME_UPDATE_EVENT, { detail: result.data.themeConfig })
        );
      }

      toast.success("系统设置已更新，页面将刷新以应用货币显示变更");
      // 刷新页面以应用货币显示变更
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="site-title">站点标题</Label>
        <Input
          id="site-title"
          value={siteTitle}
          onChange={(event) => setSiteTitle(event.target.value)}
          placeholder="例如：Claude Code Hub"
          disabled={isPending}
          maxLength={128}
          required
        />
        <p className="text-xs text-muted-foreground">
          用于设置浏览器标签页标题以及系统默认显示名称。
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="currency-display">货币显示单位</Label>
        <Select
          value={currencyDisplay}
          onValueChange={(value) => setCurrencyDisplay(value as CurrencyCode)}
          disabled={isPending}
        >
          <SelectTrigger id="currency-display">
            <SelectValue placeholder="选择货币单位" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(CURRENCY_CONFIG) as CurrencyCode[]).map((code) => {
              const config = CURRENCY_CONFIG[code];
              return (
                <SelectItem key={code} value={code}>
                  {config.symbol} {config.name} ({code})
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          修改后，系统所有页面和 API
          接口的金额显示将使用对应的货币符号（仅修改符号，不进行汇率转换）。
        </p>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-lg border border-dashed border-border px-4 py-3">
        <div>
          <Label htmlFor="allow-global-usage" className="text-sm font-medium">
            允许查看全站使用量
          </Label>
          <p className="text-xs text-muted-foreground mt-1">
            关闭后，普通用户在仪表盘仅能查看自己密钥的使用统计。
          </p>
        </div>
        <Switch
          id="allow-global-usage"
          checked={allowGlobalUsageView}
          onCheckedChange={(checked) => setAllowGlobalUsageView(checked)}
          disabled={isPending}
        />
      </div>

      <Collapsible
        open={isThemeExpanded}
        onOpenChange={(open) => setIsThemeExpanded(open)}
        className="space-y-4 rounded-3xl border border-dashed border-primary/30 bg-primary/5 p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Label className="text-sm font-semibold tracking-wide">系统主题色</Label>
            <p className="text-xs text-muted-foreground mt-1">
              左侧为实时预览，右侧可通过色块、预设与高级调节实现精细化品牌色管理。
            </p>
          </div>
          <div className="flex items-center gap-3">
            {themeChanged && (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-600">
                未保存的主题改动
              </Badge>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => setIsThemeExpanded((prev) => !prev)}
            >
              {isThemeExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {isThemeExpanded ? "折叠预览" : "展开预览"}
            </Button>
          </div>
        </div>
        <CollapsibleContent className="grid gap-6 lg:grid-cols-[360px,1fr]">
          <ThemePreviewCard theme={themeConfig} />
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-3">
              <ThemeColorPicker
                label="主色（Primary）"
                description="用于主要按钮、折线图与关键强调元素。"
                value={themeConfig.baseColor}
                defaultValue={DEFAULT_THEME_CONFIG.baseColor}
                onChange={(color) => handleThemeColorChange("baseColor", color)}
                disabled={isPending}
              />
              <ThemeColorPicker
                label="强调色（Accent）"
                description="用于徽章、状态提示和辅助文本。"
                value={themeConfig.accentColor}
                defaultValue={DEFAULT_THEME_CONFIG.accentColor}
                onChange={(color) => handleThemeColorChange("accentColor", color)}
                disabled={isPending}
              />
              <ThemeColorPicker
                label="中性色（Muted）"
                description="用于卡片背景、图表填充与空状态。"
                value={themeConfig.neutralColor}
                defaultValue={DEFAULT_THEME_CONFIG.neutralColor}
                onChange={(color) => handleThemeColorChange("neutralColor", color)}
                disabled={isPending}
              />
            </div>

            <div className="rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm">
              <div className="flex items-center justify-between text-sm">
                <p className="font-medium">自动生成的图表配色</p>
                <span className="text-xs text-muted-foreground">Chart Palette</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                {chartPalette.map((color, index) => (
                  <div key={color + index} className="flex flex-col items-center gap-2">
                    <span
                      className="h-10 w-10 rounded-xl border border-border/60 shadow-inner"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs text-muted-foreground">#{index + 1}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                图表颜色会随主色、强调色动态生成，确保不同系列拥有清晰对比度。
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "保存中..." : "保存设置"}
        </Button>
      </div>
    </form>
  );
}
