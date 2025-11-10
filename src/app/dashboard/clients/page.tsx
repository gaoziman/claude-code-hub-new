import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getUsers } from "@/actions/users";
import { getSystemSettings } from "@/repository/system-config";
import { ClientManager } from "./_components/client-manager";
import type { UsageTimeRangeValue } from "@/lib/time-range";
import { getProviderGroupOptions } from "@/actions/providers";

type ClientSearchParams = { [key: string]: string | string[] | undefined };

export const dynamic = "force-dynamic";

export default async function ClientsPage({ searchParams }: { searchParams?: ClientSearchParams }) {
  const session = await getSession();
  if (!session) {
    redirect("/login?from=/dashboard/clients");
  }

  if (session.user.role !== "admin") {
    redirect("/dashboard");
  }

  const defaultRange: UsageTimeRangeValue = "today";
  const [users, systemSettings, providerGroupOptions] = await Promise.all([
    getUsers(defaultRange),
    getSystemSettings(),
    getProviderGroupOptions(),
  ]);

  return (
    <ClientManager
      initialUsers={users}
      currencyCode={systemSettings.currencyDisplay}
      currentUser={session.user}
      initialTimeRange={defaultRange}
      searchParams={searchParams}
      providerGroupOptions={providerGroupOptions}
    />
  );
}
