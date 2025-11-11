"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ComponentType } from "react";
import {
  LayoutDashboard,
  ScrollText,
  Trophy,
  Users2,
  FileText,
  Settings,
  KeyRound,
  Activity,
} from "lucide-react";

type NavIconKey =
  | "dashboard"
  | "logs"
  | "leaderboard"
  | "keys"
  | "clients"
  | "health"
  | "docs"
  | "settings";

const ICON_MAP: Record<NavIconKey, ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  logs: ScrollText,
  leaderboard: Trophy,
  keys: KeyRound,
  clients: Users2,
  health: Activity,
  docs: FileText,
  settings: Settings,
};

export interface DashboardNavItem {
  href: string;
  label: string;
  icon?: NavIconKey;
  external?: boolean;
}

interface DashboardNavProps {
  items: DashboardNavItem[];
}

export function DashboardNav({ items }: DashboardNavProps) {
  const pathname = usePathname();

  if (items.length === 0) {
    return null;
  }

  const getIsActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }

    return pathname.startsWith(href);
  };

  return (
    <nav className="flex items-center gap-1 rounded-full border border-border/70 bg-background/90 px-1 py-1 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/70">
      {items.map((item) => {
        const isActive = getIsActive(item.href);
        const className = cn(
          "group relative flex items-center gap-1 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
          isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
        );
        const Icon = item.icon ? ICON_MAP[item.icon] : undefined;

        const content = (
          <>
            <span className="relative flex items-center gap-1">
              {Icon && (
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground/70"
                  )}
                />
              )}
              <span>{item.label}</span>
            </span>
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 rounded-full border border-transparent bg-transparent opacity-0 transition-all",
                isActive &&
                  "border-primary/50 bg-primary/10 opacity-100 shadow-[0_6px_18px_rgba(79,70,229,0.12)]"
              )}
            />
          </>
        );

        if (item.external) {
          return (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className={className}
            >
              {content}
            </a>
          );
        }

        return (
          <Link key={item.href} href={item.href} className={className}>
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
