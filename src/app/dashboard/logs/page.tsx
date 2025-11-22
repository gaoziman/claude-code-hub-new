import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { UsageLogsView } from "./_components/usage-logs-view";
import { getUsers } from "@/actions/users";
import { getProviders } from "@/actions/providers";
import { getKeys } from "@/actions/keys";
import { getSystemSettings } from "@/repository/system-config";

export const dynamic = "force-dynamic";

export default async function UsageLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const isAdmin = session.user.role === "admin";
  const isChildKeyView = session.viewMode === "key";

  const usersPromise = isAdmin ? getUsers() : Promise.resolve([]);
  const providersPromise = isAdmin ? getProviders() : Promise.resolve([]);
  const keysPromise = isAdmin
    ? Promise.resolve({ ok: true, data: [] })
    : isChildKeyView
      ? Promise.resolve({ ok: true, data: [session.key] })
      : getKeys(session.user.id);

  const [users, providers, initialKeys, resolvedSearchParams, systemSettings] = await Promise.all([
    usersPromise,
    providersPromise,
    keysPromise,
    searchParams,
    getSystemSettings(),
  ]);

  return (
    <div className="space-y-6">
      {/* 简约页面头部 */}
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">使用记录</h1>
        <p className="text-sm text-slate-600">查看 API 调用日志和使用统计</p>
      </div>

      <Suspense
        fallback={
          <div className="flex min-h-[400px] items-center justify-center">
            <div className="space-y-3 text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
              <p className="text-sm text-slate-600">加载中...</p>
            </div>
          </div>
        }
      >
        <UsageLogsView
          isAdmin={isAdmin}
          users={users}
          providers={providers}
          initialKeys={initialKeys.ok ? initialKeys.data : []}
          searchParams={resolvedSearchParams}
          isChildKeyView={isChildKeyView}
          currencyCode={systemSettings.currencyDisplay}
        />
      </Suspense>
    </div>
  );
}
