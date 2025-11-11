"use client";

import { useEffect, useMemo, useState, useTransition, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RelativeTime } from "@/components/ui/relative-time";
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  DollarSign,
  Infinity as InfinityIcon,
  Key as KeyIcon,
  Search,
  ShieldCheck,
  Tag,
  Tags,
  Users,
} from "lucide-react";
import { AddUserDialog } from "../../_components/user/add-user-dialog";
import { KeyList } from "../../_components/user/key-list";
import { KeyListHeader } from "../../_components/user/key-list-header";
import { UserActions } from "../../_components/user/user-actions";
import type { UserDisplay } from "@/types/user";
import type { User } from "@/types/user";
import type { CurrencyCode } from "@/lib/utils/currency";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { DataPagination } from "@/components/data-pagination";
import { setUserStatus } from "@/actions/users";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { UsageTimeRangeValue, USAGE_TIME_RANGE_META } from "@/lib/time-range";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchUsersByTimeRange, getUserMetrics } from "../../_lib/user-data";

const TIME_RANGE_ICON_MAP: Record<UsageTimeRangeValue, ComponentType<{ className?: string }>> = {
  today: CalendarDays,
  last7: CalendarRange,
  last30: CalendarClock,
  all: InfinityIcon,
};

const TIME_RANGE_OPTIONS = USAGE_TIME_RANGE_META.map((meta) => ({
  ...meta,
  icon: TIME_RANGE_ICON_MAP[meta.value],
}));

interface ClientManagerProps {
  initialUsers: UserDisplay[];
  currentUser: User;
  currencyCode?: CurrencyCode;
  initialTimeRange?: UsageTimeRangeValue;
  searchParams?: { [key: string]: string | string[] | undefined };
  providerGroupOptions?: string[];
}

type StatusFilter = "all" | "active" | "disabled" | "expired";

export function ClientManager({
  initialUsers,
  currentUser,
  currencyCode = "USD",
  initialTimeRange = "today",
  searchParams,
  providerGroupOptions = [],
}: ClientManagerProps) {
  const initialQuery = typeof searchParams?.q === "string" ? searchParams.q : "";
  const initialStatus =
    typeof searchParams?.status === "string" &&
    ["all", "active", "disabled", "expired"].includes(searchParams.status as string)
      ? (searchParams.status as StatusFilter)
      : ("all" as StatusFilter);

  const [users, setUsers] = useState(initialUsers);
  const [searchTerm, setSearchTerm] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus);
  const [tagFilter, setTagFilter] = useState<string>("");
  const [providerGroupFilter, setProviderGroupFilter] = useState<string | "all">("all");
  const [timeRange, setTimeRange] = useState<UsageTimeRangeValue>(initialTimeRange);
  const [isTimeChanging, startTimeTransition] = useTransition();

  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    users.forEach((user) => {
      (user.tags || []).forEach((tag) => {
        const normalized = tag.trim();
        if (normalized) {
          tagSet.add(normalized);
        }
      });
    });
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [users]);

  const combinedProviderGroups = useMemo(() => {
    const groupSet = new Set<string>();
    providerGroupOptions.forEach((group) => {
      const normalized = group.trim();
      if (normalized) {
        groupSet.add(normalized);
      }
    });
    users.forEach((user) => {
      if (user.providerGroup) {
        const normalized = user.providerGroup.trim();
        if (normalized) {
          groupSet.add(normalized);
        }
      }
    });
    return Array.from(groupSet).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [providerGroupOptions, users]);

  const summary = useMemo(() => {
    let totalKeys = 0;
    let activeKeys = 0;
    let todayCost = 0;
    let disabledUsers = 0;
    let expiredUsers = 0;

    users.forEach((user) => {
      totalKeys += user.keys.length;
      activeKeys += user.keys.filter((key) => key.status === "enabled").length;
      todayCost += user.keys.reduce((sum, key) => sum + (key.todayUsage ?? 0), 0);
      if (user.status === "disabled") disabledUsers++;
      if (user.status === "expired") expiredUsers++;
    });

    return {
      totalUsers: users.length,
      totalKeys,
      activeKeys,
      disabledKeys: totalKeys - activeKeys,
      disabledUsers,
      expiredUsers,
      todayCost,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch = normalized
        ? [
            user.name,
            user.note,
            ...(user.tags || []),
            ...(user.keys ?? []).flatMap((key) => [key.name, key.maskedKey, key.fullKey]),
          ]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(normalized))
        : true;

      if (!matchesSearch) {
        return false;
      }

      if (tagFilter && !(user.tags || []).includes(tagFilter)) {
        return false;
      }

      if (providerGroupFilter !== "all") {
        if (!user.providerGroup || user.providerGroup !== providerGroupFilter) {
          return false;
        }
      }

      if (statusFilter === "active" && user.status !== "active") {
        return false;
      }

      if (statusFilter === "disabled" && user.status !== "disabled") {
        return false;
      }

      if (statusFilter === "expired" && user.status !== "expired") {
        return false;
      }

      return true;
    });
  }, [users, searchTerm, statusFilter, tagFilter, providerGroupFilter]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(
    () => initialUsers[0]?.id ?? null
  );
  const [detailTab, setDetailTab] = useState<"table" | "card">("table");

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, tagFilter, providerGroupFilter, users, timeRange]);

  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, page, pageSize]);

  useEffect(() => {
    if (paginatedUsers.length === 0) {
      if (selectedUserId !== null) {
        setSelectedUserId(null);
      }
      return;
    }

    if (!selectedUserId || !paginatedUsers.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(paginatedUsers[0].id);
    }
  }, [paginatedUsers, selectedUserId]);

  const selectedUser = selectedUserId
    ? (paginatedUsers.find((user) => user.id === selectedUserId) ?? paginatedUsers[0] ?? null)
    : (paginatedUsers[0] ?? null);
  const selectedMetrics = selectedUser ? getUserMetrics(selectedUser) : null;

  useEffect(() => {
    setDetailTab("table");
  }, [selectedUserId]);

  const renderKeyCardView = () => {
    if (!selectedUser || selectedUser.keys.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
          当前用户暂无密钥
        </div>
      );
    }

    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {selectedUser.keys.map((key) => (
          <div
            key={key.id ?? key.maskedKey ?? key.name}
            className="rounded-2xl border border-border/60 bg-muted/10 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold text-foreground">{key.name}</div>
              <Badge variant={key.status === "enabled" ? "secondary" : "outline"}>
                {key.status === "enabled" ? "启用" : "禁用"}
              </Badge>
            </div>
            <p className="font-mono text-xs text-muted-foreground break-all">
              {key.maskedKey ?? "—"}
            </p>
            <div className="grid gap-2 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>供应商</span>
                <span className="text-foreground">{key.lastProviderName ?? "未知"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>今日调用</span>
                <span className="text-foreground">
                  {(key.todayCallCount ?? 0).toLocaleString()} 次
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>今日消耗</span>
                <span className="text-foreground">
                  {formatCurrency(key.todayUsage ?? 0, currencyCode)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>最近使用</span>
                <span className="text-foreground">
                  {key.lastUsedAt ? <RelativeTime date={new Date(key.lastUsedAt)} /> : "暂无"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const selectedRangeMeta =
    TIME_RANGE_OPTIONS.find((item) => item.value === timeRange) || TIME_RANGE_OPTIONS[0];
  const metricLabel = selectedRangeMeta.shortLabel;
  const metricLabelFull = selectedRangeMeta.label;

  const statusOptions: { label: string; value: StatusFilter }[] = [
    { label: "全部状态", value: "all" },
    { label: "启用用户", value: "active" },
    { label: "禁用用户", value: "disabled" },
    { label: "已过期", value: "expired" },
  ];

  const router = useRouter();
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);
  const [isStatusPending, startStatusTransition] = useTransition();

  const handleStatusToggle = (user: UserDisplay, enabled: boolean) => {
    if (!currentUser || currentUser.role !== "admin") return;
    if (user.status === "expired" && enabled) {
      toast.error("用户已过期，请先延长过期时间");
      return;
    }
    startStatusTransition(async () => {
      setPendingUserId(user.id);
      const result = await setUserStatus(user.id, enabled);
      if (!result.ok) {
        toast.error(result.error || "更新用户状态失败");
      } else {
        toast.success(enabled ? `${user.name} 已启用` : `${user.name} 已禁用`);
        router.refresh();
      }
      setPendingUserId(null);
    });
  };

  const handleTimeRangeChange = (value: UsageTimeRangeValue) => {
    if (value === timeRange) return;
    setTimeRange(value);
    startTimeTransition(async () => {
      try {
        const nextUsers = await fetchUsersByTimeRange(value);
        setUsers(nextUsers);
      } catch (error) {
        console.error("加载统计数据失败", error);
        toast.error("加载统计数据失败，请稍后重试");
      }
    });
  };

  const formatExpiresAt = (iso?: string | null) => {
    if (!iso) return "永不过期";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "永不过期";
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (user: UserDisplay) => {
    switch (user.status) {
      case "disabled":
        return { label: "已禁用", variant: "outline" as const, className: "text-orange-600" };
      case "expired":
        return { label: "已过期", variant: "destructive" as const };
      default:
        return { label: "启用中", variant: "secondary" as const };
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: "用户数",
            value: summary.totalUsers.toLocaleString(),
            icon: Users,
            description: "当前可用账号",
          },
          {
            title: "总密钥",
            value: summary.totalKeys.toLocaleString(),
            icon: KeyIcon,
            description: `${summary.activeKeys.toLocaleString()} 个启用中`,
          },
          {
            title: "异常用户",
            value: (summary.disabledUsers + summary.expiredUsers).toLocaleString(),
            icon: ShieldCheck,
            description: `禁用 ${summary.disabledUsers.toLocaleString()} · 过期 ${summary.expiredUsers.toLocaleString()}`,
          },
          {
            title: `${selectedRangeMeta.label}消耗`,
            value: formatCurrency(summary.todayCost, currencyCode),
            icon: DollarSign,
            description: "所有用户合计",
          },
        ].map(({ icon: Icon, ...card }) => (
          <Card key={card.title} className="rounded-2xl border border-border/70">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{card.title}</p>
                <p className="text-3xl font-semibold tracking-tight">{card.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
              </div>
              <div className="rounded-2xl bg-muted/40 p-3">
                <Icon className="h-5 w-5 text-primary" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-3xl border border-border/70">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">用户与密钥</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8 px-4 pb-8 pt-2 sm:px-6">
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-[repeat(6,minmax(0,1fr))]">
              <div className="flex h-11 items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  placeholder="搜索用户或密钥"
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="h-full border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
                />
              </div>
              <div>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as StatusFilter)}
                >
                  <SelectTrigger className="h-11 w-full rounded-xl border border-border/70 bg-muted/30 px-3 text-sm">
                    <SelectValue placeholder="全部状态" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select
                  value={timeRange}
                  onValueChange={(value) => handleTimeRangeChange(value as UsageTimeRangeValue)}
                >
                  <SelectTrigger
                    disabled={isTimeChanging}
                    className="h-11 w-full rounded-xl border border-border/70 bg-muted/30 px-3 text-sm"
                  >
                    <SelectValue className="flex items-center gap-2" placeholder="统计范围" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {TIME_RANGE_OPTIONS.map((option) => {
                      const OptionIcon = option.icon;
                      return (
                        <SelectItem key={option.value} value={option.value}>
                          <span className="flex items-center gap-2">
                            <OptionIcon className="h-4 w-4 text-muted-foreground" />
                            <span>{option.label}</span>
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select
                  value={tagFilter || "all"}
                  onValueChange={(value) => setTagFilter(value === "all" ? "" : value)}
                  disabled={availableTags.length === 0}
                >
                  <SelectTrigger className="h-11 w-full rounded-xl border border-border/70 bg-muted/30 px-3 text-sm">
                    <SelectValue className="flex items-center gap-2" placeholder="全部标签" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="all" disabled={availableTags.length === 0}>
                      <span className="flex items-center gap-2">
                        <Tags className="h-4 w-4 text-muted-foreground" />
                        <span>全部标签</span>
                      </span>
                    </SelectItem>
                    {availableTags.map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        <span className="flex items-center gap-2">
                          <Tag className="h-4 w-4 text-muted-foreground" />
                          <span className="truncate">{tag}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select
                  value={providerGroupFilter}
                  onValueChange={(value) =>
                    setProviderGroupFilter(value as typeof providerGroupFilter)
                  }
                  disabled={combinedProviderGroups.length === 0}
                >
                  <SelectTrigger className="h-11 w-full rounded-xl border border-border/70 bg-muted/30 px-3 text-sm">
                    <SelectValue placeholder="全部分组" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="all">全部分组</SelectItem>
                    {combinedProviderGroups.map((group) => (
                      <SelectItem key={group} value={group}>
                        {group}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end">
                <AddUserDialog
                  providerGroupOptions={combinedProviderGroups}
                  availableTags={availableTags}
                />
              </div>
            </div>
          </div>

          {paginatedUsers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 py-12 text-center text-sm text-muted-foreground">
              没有匹配的用户
            </div>
          ) : (
            <div className="space-y-8">
              <div className="relative">
                <div className="overflow-x-auto pb-2">
                  <div className="grid min-w-[1100px] grid-cols-5 gap-4">
                    {paginatedUsers.map((user) => {
                      const metrics = getUserMetrics(user);
                      const statusBadge = getStatusBadge(user);
                      const isSelected = user.id === selectedUserId;
                      return (
                        <button
                          type="button"
                          key={user.id}
                          onClick={() => setSelectedUserId(user.id)}
                          className={cn(
                            "group relative w-full rounded-2xl border px-4 py-4 text-left transition-all",
                            isSelected
                              ? "border-primary/60 bg-gradient-to-br from-primary/10 to-primary/5 shadow-[0_12px_30px_rgba(79,70,229,0.15)]"
                              : "border-border/70 bg-card hover:border-primary/30"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-base font-semibold text-foreground">
                                  {user.name}
                                </span>
                                {user.tags?.map((tag) => (
                                  <Badge key={tag} variant="outline" className="text-[10px]">
                                    {tag}
                                  </Badge>
                                ))}
                                <Badge
                                  variant={statusBadge.variant}
                                  className={statusBadge.className}
                                >
                                  {statusBadge.label}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {metricLabelFull}用量{" "}
                                {formatCurrency(metrics.todayUsage, currencyCode)} · 调用{" "}
                                {metrics.todayCalls.toLocaleString()} 次
                              </p>
                            </div>
                            <ChevronRight
                              className={cn(
                                "h-4 w-4 text-muted-foreground",
                                isSelected && "text-primary"
                              )}
                            />
                          </div>
                          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                            <div className="rounded-xl bg-muted/20 px-3 py-2">
                              <p className="text-[11px]">启用密钥</p>
                              <p className="text-sm font-semibold text-foreground">
                                {metrics.activeKeyCount}/{metrics.totalKeys}
                              </p>
                            </div>
                            <div className="rounded-xl bg-muted/20 px-3 py-2">
                              <p className="text-[11px]">最近活跃</p>
                              <p className="text-sm font-semibold text-foreground">
                                {metrics.lastActivity ? (
                                  <RelativeTime date={metrics.lastActivity} />
                                ) : (
                                  "暂无"
                                )}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                {selectedUser ? (
                  <div className="rounded-[32px] border border-border/60 bg-card p-6 shadow-[0_12px_35px_rgba(15,23,42,0.08)]">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-semibold text-foreground">
                            {selectedUser.name}
                          </h3>
                          {selectedUser.tags?.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[11px]">
                              {tag}
                            </Badge>
                          ))}
                          <Badge
                            variant={getStatusBadge(selectedUser).variant}
                            className={getStatusBadge(selectedUser).className}
                          >
                            {getStatusBadge(selectedUser).label}
                          </Badge>
                        </div>
                        {selectedUser.note ? (
                          <p className="mt-2 text-sm text-muted-foreground">{selectedUser.note}</p>
                        ) : null}
                        <p className="mt-2 text-xs text-muted-foreground">
                          {metricLabelFull}用量{" "}
                          {formatCurrency(selectedMetrics?.todayUsage ?? 0, currencyCode)} · 调用{" "}
                          {(selectedMetrics?.todayCalls ?? 0).toLocaleString()} 次
                        </p>
                      </div>
                      <div className="flex flex-col gap-3 text-sm text-muted-foreground lg:items-end">
                        <div className="inline-flex items-center gap-2 rounded-full bg-muted/30 px-3 py-1 text-xs">
                          过期时间：{formatExpiresAt(selectedUser.expiresAt)}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                          {currentUser.role === "admin" && (
                            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1">
                              <span>
                                {selectedUser.status === "active"
                                  ? "启用中"
                                  : selectedUser.status === "expired"
                                    ? "已过期"
                                    : "已禁用"}
                              </span>
                              <Switch
                                checked={selectedUser.status === "active"}
                                onCheckedChange={(checked) =>
                                  handleStatusToggle(selectedUser, checked)
                                }
                                disabled={isStatusPending && pendingUserId === selectedUser.id}
                                aria-label="切换用户启用状态"
                              />
                            </div>
                          )}
                          <UserActions
                            user={selectedUser}
                            currentUser={currentUser}
                            showLabels
                            providerGroupOptions={combinedProviderGroups}
                            availableTags={availableTags}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        {
                          label: "启用密钥",
                          value: `${selectedMetrics?.activeKeyCount ?? 0}/${selectedMetrics?.totalKeys ?? 0}`,
                        },
                        {
                          label: `${metricLabel}调用`,
                          value: `${(selectedMetrics?.todayCalls ?? 0).toLocaleString()} 次`,
                        },
                        {
                          label: `${metricLabel}消耗`,
                          value: formatCurrency(selectedMetrics?.todayUsage ?? 0, currencyCode),
                        },
                        {
                          label: "最近活跃",
                          value: selectedMetrics?.lastActivity ? (
                            <RelativeTime date={selectedMetrics.lastActivity} />
                          ) : (
                            "暂无"
                          ),
                        },
                      ].map((metric) => (
                        <div
                          key={metric.label}
                          className="rounded-2xl border border-border/60 bg-muted/10 px-4 py-3"
                        >
                          <p className="text-xs text-muted-foreground">{metric.label}</p>
                          <p className="text-base font-semibold text-foreground">{metric.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 space-y-4">
                      <Tabs
                        value={detailTab}
                        onValueChange={(value) => setDetailTab(value as typeof detailTab)}
                        className="space-y-4"
                      >
                        <TabsList className="w-full justify-start rounded-full bg-muted/40 p-1">
                          <TabsTrigger
                            value="table"
                            className="rounded-full px-4 py-1 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg"
                          >
                            表格视图
                          </TabsTrigger>
                          <TabsTrigger
                            value="card"
                            className="rounded-full px-4 py-1 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg"
                          >
                            卡片视图
                          </TabsTrigger>
                        </TabsList>
                        <TabsContent value="table" className="space-y-4">
                          <KeyListHeader
                            activeUser={selectedUser}
                            currentUser={currentUser}
                            canManageActiveUser={currentUser?.role === "admin"}
                            allowScopeSelection={currentUser?.role === "admin"}
                            currencyCode={currencyCode}
                            showUserActions={false}
                            metricLabel={metricLabel}
                            providerGroupOptions={combinedProviderGroups}
                            availableTags={availableTags}
                          />
                          <KeyList
                            keys={selectedUser.keys}
                            currentUser={currentUser}
                            keyOwnerUserId={selectedUser.id}
                            allowManageKeys={currentUser?.role === "admin"}
                            currencyCode={currencyCode}
                            metricLabel={metricLabel}
                          />
                        </TabsContent>
                        <TabsContent value="card">{renderKeyCardView()}</TabsContent>
                      </Tabs>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 py-12 text-center text-sm text-muted-foreground">
                    请选择左侧用户查看详情
                  </div>
                )}
              </div>
              <DataPagination
                page={page}
                pageSize={pageSize}
                total={filteredUsers.length}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={[5, 10, 20, 50]}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
