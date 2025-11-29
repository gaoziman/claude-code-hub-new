import Link from "next/link";

import type { AuthSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { DashboardNav, type DashboardNavItem } from "./dashboard-nav";
import { UserMenu } from "./user-menu";

interface DashboardHeaderProps {
  session: AuthSession | null;
}

const NAV_ITEMS: (DashboardNavItem & { adminOnly?: boolean; userOnly?: boolean; adminOrReseller?: boolean; nonAdmin?: boolean })[] = [
  { href: "/dashboard", label: "仪表盘", icon: "dashboard" },
  { href: "/dashboard/logs", label: "使用记录", icon: "logs" },
  { href: "/dashboard/keys", label: "API 密钥", icon: "keys", nonAdmin: true }, // 普通用户和代理用户可见，管理员不可见
  { href: "/dashboard/leaderboard", label: "排行榜", icon: "leaderboard" },
  { href: "/dashboard/clients", label: "用户管理", icon: "clients", adminOrReseller: true },
  { href: "/dashboard/providers/health", label: "供应商健康", icon: "health", adminOnly: true },
  { href: "/consistency", label: "数据一致性", icon: "consistency", adminOnly: true },
  { href: "/usage-doc", label: "文档", icon: "docs" },
  { href: "/settings", label: "系统设置", icon: "settings", adminOnly: true },
];

export function DashboardHeader({ session }: DashboardHeaderProps) {
  const isAdmin = session?.user.role === "admin";
  const isReseller = session?.user.role === "reseller";
  const items = NAV_ITEMS.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.adminOrReseller && !(isAdmin || isReseller)) return false;
    if (item.userOnly && isAdmin) return false;
    if (item.nonAdmin && isAdmin) return false; // 管理员不显示该菜单项
    return true;
  });

  const sessionUserForMenu = session
    ? {
        ...session.user,
        name: session.viewMode === "key" && session.key ? session.key.name : session.user.name,
      }
    : null;

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
        <DashboardNav items={items} />
        <div className="flex items-center gap-3">
          {sessionUserForMenu ? (
            <UserMenu user={sessionUserForMenu} />
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link href="/login">登录</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
