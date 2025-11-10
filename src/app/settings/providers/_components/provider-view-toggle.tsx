"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LayoutGrid, List } from "lucide-react";

export type ProviderViewMode = "table" | "card";

interface ProviderViewToggleProps {
  value: ProviderViewMode;
  onChange: (mode: ProviderViewMode) => void;
}

const viewOptions: Array<{
  mode: ProviderViewMode;
  label: string;
  icon: typeof LayoutGrid;
}> = [
  { mode: "table", label: "列表视图", icon: List },
  { mode: "card", label: "卡片视图", icon: LayoutGrid },
];

export function ProviderViewToggle({ value, onChange }: ProviderViewToggleProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
      {viewOptions.map(({ mode, label, icon: Icon }) => {
        const isActive = value === mode;
        return (
          <Button
            key={mode}
            type="button"
            variant={isActive ? "default" : "ghost"}
            size="sm"
            aria-pressed={isActive}
            className={cn(
              "gap-1 px-3 text-xs sm:text-sm",
              isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
            )}
            onClick={() => {
              if (!isActive) {
                onChange(mode);
              }
            }}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        );
      })}
    </div>
  );
}
