"use client";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProviderList } from "./provider-list";
import { ProviderTypeFilter } from "./provider-type-filter";
import { ProviderSortDropdown, type SortKey } from "./provider-sort-dropdown";
import { ProviderViewToggle, type ProviderViewMode } from "./provider-view-toggle";
import type { ProviderDisplay, ProviderType, ProviderGroupSummary } from "@/types/provider";
import type { User } from "@/types/user";
import type { CurrencyCode } from "@/lib/utils/currency";

interface ProviderManagerProps {
  providers: ProviderDisplay[];
  currentUser?: User;
  healthStatus: Record<
    number,
    {
      circuitState: "closed" | "open" | "half-open";
      failureCount: number;
      lastFailureTime: number | null;
      circuitOpenUntil: number | null;
      recoveryMinutes: number | null;
    }
  >;
  currencyCode?: CurrencyCode;
  enableMultiProviderTypes: boolean;
  providerGroups: ProviderGroupSummary[];
  canManageGroups: boolean;
}

export function ProviderManager({
  providers,
  currentUser,
  healthStatus,
  currencyCode = "USD",
  enableMultiProviderTypes,
  providerGroups,
  canManageGroups,
}: ProviderManagerProps) {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState<ProviderType | "all">("all");
  const [sortBy, setSortBy] = useState<SortKey>("priority");
  const [viewMode, setViewMode] = useState<ProviderViewMode>("table");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("provider_view_mode");
    if (stored === "table" || stored === "card") {
      setViewMode(stored);
    }
  }, []);

  const handleViewModeChange = (mode: ProviderViewMode) => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("provider_view_mode", mode);
    }
  };

  // 根据类型筛选供应商
  const filteredProviders = useMemo(() => {
    const filtered =
      typeFilter === "all"
        ? providers
        : providers.filter((provider) => provider.providerType === typeFilter);

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "priority":
          // 优先级：数值越小越优先（1 > 2 > 3），升序排列
          return a.priority - b.priority;
        case "weight":
          // 权重：数值越大越优先，降序排列
          return b.weight - a.weight;
        case "createdAt": {
          const timeA = new Date(a.createdAt).getTime();
          const timeB = new Date(b.createdAt).getTime();
          if (Number.isNaN(timeA) || Number.isNaN(timeB)) {
            return b.createdAt.localeCompare(a.createdAt);
          }
          return timeB - timeA;
        }
        default:
          return 0;
      }
    });
  }, [providers, sortBy, typeFilter]);

  return (
    <div className="space-y-4">
      {/* 筛选条件 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ProviderTypeFilter value={typeFilter} onChange={setTypeFilter} />
          <ProviderSortDropdown value={sortBy} onChange={setSortBy} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ProviderViewToggle value={viewMode} onChange={handleViewModeChange} />
          <div className="text-sm text-muted-foreground">
            显示 {filteredProviders.length} / {providers.length} 个供应商
          </div>
        </div>
      </div>

      {/* 供应商列表 */}
      <ProviderList
        providers={filteredProviders}
        currentUser={currentUser}
        healthStatus={healthStatus}
        currencyCode={currencyCode}
        enableMultiProviderTypes={enableMultiProviderTypes}
        providerGroups={providerGroups}
        canManageGroups={canManageGroups}
        onGroupsUpdated={() => router.refresh()}
        viewMode={viewMode}
      />
    </div>
  );
}

export type { ProviderDisplay } from "@/types/provider";
