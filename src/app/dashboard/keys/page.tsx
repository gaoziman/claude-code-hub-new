import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getCurrentUserWithUsage } from "@/actions/users";
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
  searchParams?: Promise<KeyPageSearchParams>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login?from=/dashboard/keys");
  }

  if (session.user.role === "admin") {
    redirect("/dashboard/clients");
  }

  const resolvedSearchParams = await searchParams;
  const range = resolveRange(resolvedSearchParams?.range);

  // API 密钥页面：所有角色（User、Reseller）都只显示自己的密钥
  // 使用 getCurrentUserWithUsage() 获取当前用户的完整数据（包含 keys 和 usage）
  const [currentUserWithUsage, systemSettings] = await Promise.all([
    getCurrentUserWithUsage(range),
    getSystemSettings(),
  ]);

  if (!currentUserWithUsage) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-lg font-semibold text-foreground">暂未找到可用的用户信息</p>
        <p className="mt-2 text-sm text-muted-foreground">请联系管理员确认账号状态。</p>
      </div>
    );
  }

  return (
    <KeyWorkspace
      initialUsers={[currentUserWithUsage]} // ⭐ 只传递当前用户自己，数组长度固定为 1
      currentUser={session.user}
      viewMode={session.viewMode}
      currencyCode={systemSettings.currencyDisplay}
      initialTimeRange={range}
    />
  );
}
