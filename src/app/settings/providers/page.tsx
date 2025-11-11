import {
  getProviders,
  getProvidersHealthStatus,
  getProviderGroupsSummary,
} from "@/actions/providers";
import { Section } from "@/components/section";
import { ProviderManager } from "./_components/provider-manager";
import { AddProviderDialog } from "./_components/add-provider-dialog";
import { SchedulingRulesDialog } from "./_components/scheduling-rules-dialog";
import { SettingsPageHeader } from "../_components/settings-page-header";
import { getSession } from "@/lib/auth";
import { getSystemSettings } from "@/repository/system-config";
import { getEnvConfig } from "@/lib/config/env.schema";

export const dynamic = "force-dynamic";

export default async function SettingsProvidersPage() {
  const [providers, session, healthStatus, systemSettings, providerGroups] = await Promise.all([
    getProviders(),
    getSession(),
    getProvidersHealthStatus(),
    getSystemSettings(),
    getProviderGroupsSummary(),
  ]);

  // 读取多供应商类型支持配置
  const enableMultiProviderTypes = getEnvConfig().ENABLE_MULTI_PROVIDER_TYPES;
  const canManageGroups = session?.user.role === "admin";

  return (
    <>
      <SettingsPageHeader title="供应商管理" description="配置 API 服务商并维护可用状态。" />

      <Section
        title="服务商管理"
        description="配置上游服务商的金额限流和并发限制，留空表示无限制。"
        actions={
          <div className="flex gap-2">
            <SchedulingRulesDialog />
            <AddProviderDialog
              enableMultiProviderTypes={enableMultiProviderTypes}
              providerGroups={providerGroups}
              canManageGroups={canManageGroups}
            />
          </div>
        }
      >
        <ProviderManager
          providers={providers}
          currentUser={session?.user}
          healthStatus={healthStatus}
          currencyCode={systemSettings.currencyDisplay}
          enableMultiProviderTypes={enableMultiProviderTypes}
          providerGroups={providerGroups}
          canManageGroups={canManageGroups}
        />
      </Section>
    </>
  );
}
