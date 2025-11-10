import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getUserStatistics,
  getProviderUsageTrends,
  getTopKeysUsageTrends,
} from "@/actions/statistics";
import { hasPriceTable } from "@/actions/model-prices";
import { getSystemSettings } from "@/repository/system-config";
import { StatisticsWrapper } from "./_components/statistics";
import { OverviewPanel } from "@/components/customs/overview-panel";
import { DEFAULT_TIME_RANGE } from "@/types/statistics";
import type { ProviderTrendData, KeyTrendData } from "@/types/statistics";
import { getActiveProviderTypes } from "@/repository/provider";
import type { ProviderType } from "@/types/provider";
import { ProviderTrendPanel } from "./_components/provider-trends";
import { KeyTrendPanel } from "./_components/key-trends/key-trend-panel";

const DEFAULT_PROVIDER_TREND_TYPE: ProviderType = "claude-auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // 检查价格表是否存在，如果不存在则跳转到价格上传页面
  const hasPrices = await hasPriceTable();
  if (!hasPrices) {
    redirect("/settings/prices?required=true");
  }

  const session = await getSession();
  const isAdmin = session?.user.role === "admin";

  const [statistics, systemSettings] = await Promise.all([
    getUserStatistics(DEFAULT_TIME_RANGE),
    getSystemSettings(),
  ]);

  let providerTypes: ProviderType[] = [];
  let initialProviderType: ProviderType = DEFAULT_PROVIDER_TREND_TYPE;
  let providerTrendInitialData: ProviderTrendData | undefined;
  let keyTrendInitialData: KeyTrendData | undefined;

  if (isAdmin) {
    providerTypes = await getActiveProviderTypes();
    const normalizedTypes =
      providerTypes.length > 0 ? providerTypes : [DEFAULT_PROVIDER_TREND_TYPE];
    initialProviderType = normalizedTypes.includes(DEFAULT_PROVIDER_TREND_TYPE)
      ? DEFAULT_PROVIDER_TREND_TYPE
      : normalizedTypes[0];

    const [providerTrendResult, keyTrendResult] = await Promise.all([
      getProviderUsageTrends(initialProviderType),
      getTopKeysUsageTrends(),
    ]);

    providerTrendInitialData = providerTrendResult.ok ? providerTrendResult.data : undefined;
    keyTrendInitialData = keyTrendResult.ok ? keyTrendResult.data : undefined;
  }

  return (
    <div className="space-y-6">
      <OverviewPanel currencyCode={systemSettings.currencyDisplay} />

      <div>
        <StatisticsWrapper
          initialData={statistics.ok ? statistics.data : undefined}
          currencyCode={systemSettings.currencyDisplay}
        />
      </div>

      {isAdmin && (
        <div className="space-y-6">
          <KeyTrendPanel
            title="API Keys 使用趋势"
            description="近 7 天内使用量前 7 的 API Keys 趋势"
            initialData={keyTrendInitialData}
            currencyCode={systemSettings.currencyDisplay}
          />

          <ProviderTrendPanel
            title="供应商趋势"
            description="查看各上游 API Key 在近 7 天的消耗与调用情况"
            initialData={providerTrendInitialData}
            providerTypes={providerTypes}
            defaultProviderType={DEFAULT_PROVIDER_TREND_TYPE}
            initialProviderType={initialProviderType}
            currencyCode={systemSettings.currencyDisplay}
          />
        </div>
      )}
    </div>
  );
}
