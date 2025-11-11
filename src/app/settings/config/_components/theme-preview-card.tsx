"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { resolveTheme } from "@/lib/theme";
import type { SystemThemeConfig } from "@/types/system-config";

interface ThemePreviewCardProps {
  theme: SystemThemeConfig;
}

export function ThemePreviewCard({ theme }: ThemePreviewCardProps) {
  const palette = useMemo(() => resolveTheme(theme).light, [theme]);

  const previewVars = useMemo(() => {
    return Object.entries(palette).reduce(
      (acc, [key, value]) => {
        acc[key as keyof typeof acc] = value;
        return acc;
      },
      {} as Record<string, string>
    );
  }, [palette]);

  const gradient = `linear-gradient(135deg, ${palette["--primary"]} 0%, ${palette["--accent"]} 60%, ${palette["--muted"]} 100%)`;

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-border/70 bg-card/50 p-6 lg:max-w-[380px]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">实时预览</p>
          <p className="text-base font-semibold">仪表盘片段</p>
        </div>
      </div>

      <div
        className="relative rounded-2xl border border-border/60 p-4 shadow-inner"
        style={{
          backgroundImage: gradient,
          ...previewVars,
        }}
      >
        <div className="rounded-xl bg-background/80 p-4 backdrop-blur-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">API Usage</p>
              <p className="text-2xl font-semibold" style={{ color: palette["--primary"] }}>
                98.3%
              </p>
            </div>
            <Badge
              className="rounded-full px-3 py-1 text-xs font-medium"
              style={{
                backgroundColor: palette["--accent"],
                color: palette["--accent-foreground"],
              }}
            >
              正常
            </Badge>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2">
              <div>
                <p className="text-xs text-muted-foreground">本周新用户</p>
                <p className="font-medium">1,482</p>
              </div>
              <span
                className="rounded-full px-2 py-1 text-xs font-semibold"
                style={{
                  backgroundColor: palette["--primary"],
                  color: palette["--primary-foreground"],
                }}
              >
                +12%
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                className="flex-1 shadow-lg"
                style={{
                  backgroundColor: palette["--primary"],
                  color: palette["--primary-foreground"],
                }}
              >
                主操作按钮
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-dashed"
                style={{
                  borderColor: palette["--accent"],
                  color: palette["--accent"],
                }}
              >
                次要操作
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        {[
          { label: "Primary", value: theme.baseColor, tone: palette["--primary"] },
          { label: "Accent", value: theme.accentColor, tone: palette["--accent"] },
          { label: "Muted", value: theme.neutralColor, tone: palette["--muted"] },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border/80 bg-background/60 p-3">
            <div
              className="h-8 w-full rounded-md border border-border/60"
              style={{ backgroundColor: item.tone }}
            />
            <p className="mt-2 text-xs text-muted-foreground">{item.label}</p>
            <p className="font-mono text-xs">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
