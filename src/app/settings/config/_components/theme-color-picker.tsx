"use client";

import { useEffect, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { DEFAULT_THEME_CONFIG } from "@/types/system-config";

const PRESET_COLORS = [
  "#FF8A00",
  "#FFB347",
  "#FF6138",
  "#FF8CC6",
  "#B86CFF",
  "#6C8CFF",
  "#3AC0FF",
  "#19C895",
  "#0EAD69",
  "#1E90FF",
  "#FF5C5C",
  "#FF9478",
] as const;

type HSL = {
  h: number;
  s: number;
  l: number;
};

interface ThemeColorPickerProps {
  label: string;
  description: string;
  value: string;
  defaultValue?: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

export function ThemeColorPicker({
  label,
  description,
  value,
  defaultValue,
  onChange,
  disabled,
}: ThemeColorPickerProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [hsl, setHsl] = useState<HSL>(() => hexToHsl(value));

  useEffect(() => {
    setDraft(value);
    setHsl(hexToHsl(value));
  }, [value]);

  const handleInputChange = (next: string) => {
    const formatted = next.toUpperCase();
    if (!formatted.startsWith("#")) {
      setDraft(`#${formatted}`);
      return;
    }

    if (/^#([0-9A-F]{0,6})$/.test(formatted)) {
      setDraft(formatted);
      if (formatted.length === 7) {
        onChange(formatted);
      }
    }
  };

  const handleSliderChange = (key: keyof HSL, val: number) => {
    setHsl((prev) => {
      const next = { ...prev, [key]: val };
      onChange(hslToHex(next));
      return next;
    });
  };

  const restoredDefault = useMemo(
    () =>
      defaultValue ??
      DEFAULT_THEME_CONFIG[
        label.includes("Primary") ? "baseColor" : label.includes("Accent") ? "accentColor" : "neutralColor"
      ],
    [defaultValue, label]
  );

  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label className="text-sm font-semibold">{label}</Label>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="ghost" size="sm" disabled={disabled}>
                高级调整
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="sm:max-w-lg">
              <SheetHeader>
                <SheetTitle>{label} 高级调节</SheetTitle>
                <SheetDescription>通过色相、饱和度、亮度滑块实现更精细的品牌色调整。</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-6 px-4 pb-8">
                <AdvancedSlider
                  label="色相"
                  unit="°"
                  min={0}
                  max={360}
                  step={1}
                  value={hsl.h}
                  onChange={(val) => handleSliderChange("h", val)}
                />
                <AdvancedSlider
                  label="饱和度"
                  unit="%"
                  min={0}
                  max={100}
                  step={1}
                  value={hsl.s}
                  onChange={(val) => handleSliderChange("s", val)}
                />
                <AdvancedSlider
                  label="亮度"
                  unit="%"
                  min={0}
                  max={100}
                  step={1}
                  value={hsl.l}
                  onChange={(val) => handleSliderChange("l", val)}
                />
                <div
                  className="rounded-2xl border border-border/80 p-4 text-center"
                  style={{ backgroundColor: value, color: getReadableTextColor(value) }}
                >
                  <p className="text-sm text-muted-foreground">实时预览</p>
                  <p className="font-mono text-xl tracking-wide">{value}</p>
                </div>
              </div>
              <SheetFooter className="flex flex-row items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onChange(restoredDefault);
                    setSheetOpen(false);
                  }}
                >
                  恢复默认
                </Button>
                <Button type="button" onClick={() => setSheetOpen(false)}>
                  完成
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || value === restoredDefault}
            onClick={() => onChange(restoredDefault)}
          >
            重置
          </Button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="h-24 w-24 rounded-2xl border-2 border-border/80 shadow-inner transition hover:scale-[1.01]"
              style={{ backgroundColor: value }}
              disabled={disabled}
            />
          </PopoverTrigger>
          <PopoverContent className="w-[360px]" align="start">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Input
                  value={draft}
                  onChange={(event) => handleInputChange(event.target.value)}
                  className="uppercase"
                  maxLength={7}
                  disabled={disabled}
                />
                <input
                  type="color"
                  value={value}
                  disabled={disabled}
                  onChange={(event) => onChange(event.target.value.toUpperCase())}
                  className="h-10 w-16 rounded-md border border-input bg-transparent p-1"
                />
              </div>
              <div className="grid grid-cols-6 gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    type="button"
                    key={color}
                    className={cn(
                      "h-8 w-8 rounded-md border border-transparent transition",
                      value === color ? "ring-2 ring-offset-2 ring-primary" : "border-border"
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      onChange(color);
                      setPopoverOpen(false);
                    }}
                    aria-label={`选择颜色 ${color}`}
                    disabled={disabled}
                  />
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="font-mono text-base">{value}</p>
            <span className="text-xs text-muted-foreground">HEX</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
            <div>H: {Math.round(hsl.h)}</div>
            <div>S: {Math.round(hsl.s)}%</div>
            <div>L: {Math.round(hsl.l)}%</div>
          </div>
          <p className="text-xs text-muted-foreground">
            提示：点击色块快速调色，或使用高级调整以获得细腻的渐变与阴影效果。
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-6 gap-2">
        {PRESET_COLORS.map((color) => (
          <button
            type="button"
            key={color}
            className={cn(
              "h-9 rounded-lg border border-border/70 transition hover:-translate-y-[1px]",
              value === color && "ring-2 ring-offset-2 ring-primary"
            )}
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
            aria-label={`选择颜色 ${color}`}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

function AdvancedSlider({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <p className="font-medium">{label}</p>
        <span className="font-mono text-muted-foreground">
          {Math.round(value)}
          {unit}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => onChange(next ?? value)}
      />
    </div>
  );
}

function hexToHsl(hex: string): HSL {
  const parsed = /^#?([A-Fa-f0-9]{6})$/.exec(hex);
  if (!parsed) {
    return hexToHsl("#000000");
  }
  const bigint = parseInt(parsed[1], 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex({ h, s, l }: HSL): string {
  const sNorm = s / 100;
  const lNorm = l / 100;

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (0 <= h && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (60 <= h && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (120 <= h && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (180 <= h && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (240 <= h && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  const r255 = Math.round((r + m) * 255);
  const g255 = Math.round((g + m) * 255);
  const b255 = Math.round((b + m) * 255);

  return (
    "#" +
    [r255, g255, b255]
      .map((val) => {
        const hex = val.toString(16).toUpperCase();
        return hex.length === 1 ? `0${hex}` : hex;
      })
      .join("")
  );
}

function getReadableTextColor(hex: string): string {
  const parsed = /^#?([A-Fa-f0-9]{6})$/.exec(hex);
  if (!parsed) return "#111111";
  const bigint = parseInt(parsed[1], 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111111" : "#FFFFFF";
}
