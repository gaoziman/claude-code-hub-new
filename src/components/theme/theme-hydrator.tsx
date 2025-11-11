"use client";

import { useEffect } from "react";
import { buildThemeCssText, normalizeThemeConfig } from "@/lib/theme";
import type { SystemThemeConfig } from "@/types/system-config";

export const THEME_UPDATE_EVENT = "system-theme:update";

declare global {
  interface Window {
    __SYSTEM_THEME__?: SystemThemeConfig;
  }
}

interface ThemeHydratorProps {
  themeConfig: SystemThemeConfig;
}

export function ThemeHydrator({ themeConfig }: ThemeHydratorProps) {
  useEffect(() => {
    const normalized = normalizeThemeConfig(themeConfig);
    applyTheme(normalized);

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<SystemThemeConfig>;
      if (!customEvent.detail) {
        return;
      }
      applyTheme(customEvent.detail);
    };

    window.addEventListener(THEME_UPDATE_EVENT, handler);
    return () => {
      window.removeEventListener(THEME_UPDATE_EVENT, handler);
    };
  }, [themeConfig]);

  return null;
}

function applyTheme(theme: SystemThemeConfig) {
  const normalized = normalizeThemeConfig(theme);
  const styleElement = document.getElementById("system-theme-style");

  if (styleElement) {
    styleElement.textContent = buildThemeCssText(normalized);
  }

  window.__SYSTEM_THEME__ = normalized;
  document.documentElement.dataset.themeLoaded = "client";
}
