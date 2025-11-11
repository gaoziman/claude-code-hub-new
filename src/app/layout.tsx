import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Footer } from "@/components/customs/footer";
import { AppProviders } from "./providers";
import { getSystemSettings } from "@/repository/system-config";
import { logger } from "@/lib/logger";
import { buildThemeCssText } from "@/lib/theme";
import { ThemeHydrator } from "@/components/theme/theme-hydrator";
import { DEFAULT_THEME_CONFIG } from "@/types/system-config";

const FALLBACK_TITLE = "Claude Code Hub";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await getSystemSettings();
    const title = settings.siteTitle?.trim() || FALLBACK_TITLE;

    return {
      title,
      description: title,
    };
  } catch (error) {
    logger.error("Failed to load system settings for metadata", { error });
    return {
      title: FALLBACK_TITLE,
      description: FALLBACK_TITLE,
    };
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let settings;
  let themeCss = "";

  try {
    settings = await getSystemSettings();
    themeCss = buildThemeCssText(settings.themeConfig);
  } catch (error) {
    logger.error("Failed to load system settings for layout", { error });
    // 使用默认配置,避免构建时失败
    settings = {
      siteTitle: FALLBACK_TITLE,
      themeConfig: DEFAULT_THEME_CONFIG, // 使用默认主题配置
      currencyDisplay: "USD",
      allowGlobalUsageView: false,
      enableAutoCleanup: false,
      cleanupRetentionDays: 30,
      cleanupSchedule: "0 0 * * *",
      cleanupBatchSize: 1000,
      enableClientVersionCheck: false,
    };
  }

  return (
    <html lang="en">
      <head>
        <style id="system-theme-style" dangerouslySetInnerHTML={{ __html: themeCss }} />
      </head>
      <body className="antialiased" data-theme-loaded="server">
        <AppProviders>
          <div className="flex min-h-screen flex-col bg-background text-foreground">
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
          <Toaster />
          <ThemeHydrator themeConfig={settings.themeConfig} />
        </AppProviders>
      </body>
    </html>
  );
}
