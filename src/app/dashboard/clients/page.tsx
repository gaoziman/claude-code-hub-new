import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getUsers, getCurrentUserWithUsage } from "@/actions/users";
import { getSystemSettings } from "@/repository/system-config";
import { ClientManager } from "./_components/client-manager";
import type { UsageTimeRangeValue } from "@/lib/time-range";
import { getProviderGroupOptions } from "@/actions/providers";

type ClientSearchParams = { [key: string]: string | string[] | undefined };

export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams?: Promise<ClientSearchParams>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login?from=/dashboard/clients");
  }

  // 允许 admin 和 reseller 访问用户管理页面
  if (session.user.role !== "admin" && session.user.role !== "reseller") {
    redirect("/dashboard");
  }

  const defaultRange: UsageTimeRangeValue = "today";

  //  并行查询：用户列表 + 当前用户完整数据（包含 usage）
  const [users, systemSettings, providerGroupOptions, resolvedSearchParams, currentUserWithUsage] =
    await Promise.all([
      getUsers(defaultRange),
      getSystemSettings(),
      getProviderGroupOptions(),
      searchParams,
      // 单独查询当前用户的完整数据（Reseller 创建子用户时需要显示可用额度）
      getCurrentUserWithUsage(defaultRange),
    ]);

  return (
    <ClientManager
      initialUsers={users}
      currencyCode={systemSettings.currencyDisplay}
      currentUser={session.user}
      initialTimeRange={defaultRange}
      searchParams={resolvedSearchParams}
      providerGroupOptions={providerGroupOptions}
      currentUserWithUsage={currentUserWithUsage}
    />
  );
}
