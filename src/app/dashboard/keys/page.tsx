import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getUsers } from "@/actions/users";
import { getSystemSettings } from "@/repository/system-config";
import type { UsageTimeRangeValue } from "@/lib/time-range";
import { KeyWorkspace } from "./_components/key-workspace";

export const dynamic = "force-dynamic";

interface KeyPageSearchParams {
  range?: string;
}

function resolveRange(param?: string): UsageTimeRangeValue {
  if (!param) return "today";
  const allowed: UsageTimeRangeValue[] = ["today", "last7", "last30", "all"];
  return allowed.includes(param as UsageTimeRangeValue) ? (param as UsageTimeRangeValue) : "today";
}

export default async function UserKeysPage({
  searchParams,
}: {
  searchParams?: KeyPageSearchParams;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login?from=/dashboard/keys");
  }

  if (session.user.role === "admin") {
    redirect("/dashboard/clients");
  }

  const range = resolveRange(searchParams?.range);

  const [users, systemSettings] = await Promise.all([
    getUsers(range),
    getSystemSettings(),
  ]);

  if (!users || users.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-lg font-semibold text-foreground">暂未找到可用的用户信息</p>
        <p className="mt-2 text-sm text-muted-foreground">请联系管理员确认账号状态。</p>
      </div>
    );
  }

  return (
    <KeyWorkspace
      initialUsers={users}
      currentUser={session.user}
      viewMode={session.viewMode}
      currencyCode={systemSettings.currencyDisplay}
      initialTimeRange={range}
    />
  );
}
