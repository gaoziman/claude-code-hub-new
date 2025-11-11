import {
  DEFAULT_THEME_CONFIG,
  type ResolvedTheme,
  type SystemThemeConfig,
  type ThemeVariableMap,
} from "@/types/system-config";

type Oklch = {
  l: number;
  c: number;
  h: number;
};

type OklchAdjustments = {
  deltaL?: number;
  deltaC?: number;
  deltaH?: number;
};

const TEXT_LIGHT = "oklch(0.985 0 0)";
const TEXT_DARK = "oklch(0.141 0.005 285.823)";

const DEFAULT_CHART_ROTATIONS = [0, 30, -35, 60, -60];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function normalizeHexColor(color: string | undefined, fallback: string): string {
  if (!color) {
    return fallback;
  }
  const trimmed = color.trim();
  if (/^#([0-9a-fA-F]{6})$/.test(trimmed)) {
    return `#${trimmed.slice(1).toUpperCase()}`;
  }
  return fallback;
}

export function mergeThemeConfig(
  current: SystemThemeConfig | undefined,
  overrides: Partial<SystemThemeConfig>
): SystemThemeConfig {
  const base = normalizeHexColor(
    overrides.baseColor ?? current?.baseColor,
    DEFAULT_THEME_CONFIG.baseColor
  );
  const accent = normalizeHexColor(
    overrides.accentColor ?? current?.accentColor,
    DEFAULT_THEME_CONFIG.accentColor
  );
  const neutral = normalizeHexColor(
    overrides.neutralColor ?? current?.neutralColor,
    DEFAULT_THEME_CONFIG.neutralColor
  );

  return {
    baseColor: base,
    accentColor: accent,
    neutralColor: neutral,
  };
}

export function normalizeThemeConfig(config?: SystemThemeConfig): SystemThemeConfig {
  if (!config) {
    return DEFAULT_THEME_CONFIG;
  }
  return mergeThemeConfig(config, {});
}

export function buildThemeCssText(config?: SystemThemeConfig): string {
  const resolved = resolveTheme(config);
  const rootVars = themeVarsToCss(resolved.light);
  const darkVars = themeVarsToCss(resolved.dark);
  return `:root {\n${rootVars}\n}\n.dark {\n${darkVars}\n}`;
}

export function resolveTheme(config?: SystemThemeConfig): ResolvedTheme {
  const normalized = normalizeThemeConfig(config);
  return {
    light: createPalette(normalized, "light"),
    dark: createPalette(normalized, "dark"),
  };
}

function themeVarsToCss(vars: ThemeVariableMap): string {
  return Object.entries(vars)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");
}

function createPalette(config: SystemThemeConfig, mode: "light" | "dark"): ThemeVariableMap {
  const base = hexToOklch(config.baseColor);
  const accent = hexToOklch(config.accentColor);
  const neutral = hexToOklch(config.neutralColor);

  const primary = mode === "light" ? base : adjust(base, { deltaL: -0.25 });
  const accentTone =
    mode === "light" ? adjust(accent, { deltaL: 0.08 }) : adjust(accent, { deltaL: -0.18 });
  const neutralTone =
    mode === "light"
      ? adjust(neutral, { deltaL: 0.12, deltaC: -0.05 })
      : adjust(neutral, { deltaL: -0.15, deltaC: -0.07 });

  const chart = DEFAULT_CHART_ROTATIONS.map((rotation, index) => {
    const reference = index % 2 === 0 ? base : accent;
    const deltaL = mode === "light" ? 0.04 * (index - 1) : -0.03 * index;
    return toCssColor(adjust(reference, { deltaH: rotation, deltaL }));
  });

  return {
    "--primary": toCssColor(primary),
    "--primary-foreground": mode === "light" ? TEXT_LIGHT : TEXT_LIGHT,
    "--ring": toCssColor(
      adjust(primary, { deltaC: -0.05, deltaL: mode === "light" ? -0.02 : 0.08 })
    ),
    "--accent": toCssColor(accentTone),
    "--accent-foreground": mode === "light" ? TEXT_DARK : TEXT_LIGHT,
    "--muted": toCssColor(neutralTone),
    "--muted-foreground": mode === "light" ? TEXT_DARK : TEXT_LIGHT,
    "--sidebar-primary": toCssColor(adjust(primary, { deltaL: mode === "light" ? -0.05 : -0.18 })),
    "--sidebar-primary-foreground": TEXT_LIGHT,
    "--chart-1": chart[0],
    "--chart-2": chart[1] ?? chart[0],
    "--chart-3": chart[2] ?? chart[0],
    "--chart-4": chart[3] ?? chart[0],
    "--chart-5": chart[4] ?? chart[0],
  };
}

function adjust(color: Oklch, adjustments: OklchAdjustments = {}): Oklch {
  const { deltaL = 0, deltaC = 0, deltaH = 0 } = adjustments;
  const l = clamp(color.l + deltaL, 0, 1);
  const c = clamp(color.c + deltaC, 0, 0.5);
  let h = color.h + deltaH;
  if (h < 0) {
    h += 360;
  }
  if (h >= 360) {
    h -= 360;
  }
  return { l, c, h };
}

function toCssColor(value: Oklch): string {
  return `oklch(${value.l.toFixed(3)} ${value.c.toFixed(3)} ${value.h.toFixed(3)})`;
}

function hexToOklch(hex: string): Oklch {
  const { r, g, b } = hexToRgb(hex);
  const l = srgbToLinear(r);
  const m = srgbToLinear(g);
  const s = srgbToLinear(b);

  const l_ = Math.cbrt(0.4122214708 * l + 0.5363325363 * m + 0.0514459929 * s);
  const m_ = Math.cbrt(0.2119034982 * l + 0.6806995451 * m + 0.1073969566 * s);
  const s_ = Math.cbrt(0.0883024619 * l + 0.2817188376 * m + 0.6299787005 * s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bLab = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const C = Math.sqrt(a * a + bLab * bLab);
  let H = (Math.atan2(bLab, a) * 180) / Math.PI;
  if (H < 0) {
    H += 360;
  }
  return {
    l: clamp(L, 0, 1),
    c: clamp(C, 0, 0.5),
    h: H,
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!normalized) {
    return hexToRgb(DEFAULT_THEME_CONFIG.baseColor);
  }
  const value = normalized[1];
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  return { r, g, b };
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
