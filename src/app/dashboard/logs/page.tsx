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
  const isReseller = session.user.role === "reseller";
  const isChildKeyView = session.viewMode === "key";

  //  管理员：加载所有用户；代理用户：加载自己+子用户；普通用户：不加载
  const usersPromise = isAdmin
    ? getUsers()
    : isReseller
      ? (async () => {
          // 代理用户：需要同时加载自己和子用户
          const { getCurrentUserWithUsage } = await import("@/actions/users");
          const [childUsers, selfUser] = await Promise.all([
            getUsers(), // 获取子用户
            getCurrentUserWithUsage("today"), // 获取代理用户自己
          ]);

          // 将代理用户自己添加到列表开头
          return selfUser ? [selfUser, ...childUsers] : childUsers;
        })()
      : Promise.resolve([]);

  const providersPromise = isAdmin ? getProviders() : Promise.resolve([]);
  const keysPromise = isAdmin
    ? Promise.resolve({ ok: true, data: [] })
    : isChildKeyView && session.key
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
