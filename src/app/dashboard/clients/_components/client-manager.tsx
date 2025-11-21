"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ComponentType,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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

    // 处理供应商的分组选项（可能包含逗号分隔的多个分组）
    providerGroupOptions.forEach((group) => {
      const tags = group
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
      tags.forEach((tag) => groupSet.add(tag));
    });

    // 处理用户的分组（可能包含逗号分隔的多个分组）
    users.forEach((user) => {
      if (user.providerGroup) {
        const tags = user.providerGroup
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0);
        tags.forEach((tag) => groupSet.add(tag));
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

  const matchedUsersCount = filteredUsers.length;
  const activeUserCount = summary.totalUsers - summary.disabledUsers - summary.expiredUsers;
  const inlineStats = [
    {
      label: "匹配用户",
      value: `${matchedUsersCount} 位`,
      accent: "from-primary/20 to-primary/5",
    },
    {
      label: "启用用户",
      value: `${activeUserCount} 位`,
      accent: "from-emerald-200 to-emerald-50",
    },
    {
      label: "禁用",
      value: `${summary.disabledUsers} 位`,
      accent: "from-amber-100 to-orange-50",
    },
    {
      label: "过期",
      value: `${summary.expiredUsers} 位`,
      accent: "from-rose-100 to-rose-50",
    },
  ];

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(
    () => initialUsers[0]?.id ?? null
  );

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

  const handleUserCardKeyDown = (event: KeyboardEvent<HTMLDivElement>, userId: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedUserId(userId);
    }
  };

  const handleQuickToggle = (event: MouseEvent<HTMLButtonElement>, user: UserDisplay) => {
    event.stopPropagation();
    handleStatusToggle(user, user.status !== "active");
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
          <Card key={card.title} className="rounded-xl border border-border/60">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{card.title}</p>
                <p className="text-3xl font-semibold tracking-tight">{card.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <Icon className="h-5 w-5 text-primary" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-2xl border border-border/60">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">用户与密钥</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 px-4 pb-8 pt-2 sm:px-6">
          <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
            {inlineStats.map((stat) => (
              <div
                key={stat.label}
                className={cn(
                  "rounded-lg border border-border/50 bg-gradient-to-br px-4 py-3 shadow-sm",
                  stat.accent
                )}
              >
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-semibold text-foreground">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-background to-muted/30 p-4 shadow-[0_20px_40px_rgba(15,23,42,0.06)] sm:p-5">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
              <div className="flex h-11 items-center gap-2 rounded-lg border border-border/60 bg-white/70 px-3">
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
                  <SelectTrigger className="h-11 w-full rounded-lg border border-border/60 bg-white/70 px-3 text-sm">
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
                    className="h-11 w-full rounded-lg border border-border/60 bg-white/70 px-3 text-sm"
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
                  <SelectTrigger className="h-11 w-full rounded-lg border border-border/60 bg-white/70 px-3 text-sm">
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
                  <SelectTrigger className="h-11 w-full rounded-lg border border-border/60 bg-white/70 px-3 text-sm">
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
              <div className="flex items-center justify-end">
                <AddUserDialog
                  providerGroupOptions={combinedProviderGroups}
                  availableTags={availableTags}
                />
              </div>
            </div>
          </div>

          {paginatedUsers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 py-12 text-center text-sm text-muted-foreground">
              没有匹配的用户
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-2xl border border-border/50 bg-gradient-to-b from-background via-white to-muted/20 p-5 shadow-[0_20px_40px_rgba(15,23,42,0.06)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-foreground">用户列表</p>
                    <p className="text-xs text-muted-foreground">选择用户查看下方详情与密钥</p>
                  </div>
                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
                    {matchedUsersCount} 人
                  </Badge>
                </div>
                <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {paginatedUsers.map((user) => {
                    const metrics = getUserMetrics(user);
                    const statusBadge = getStatusBadge(user);
                    const isSelected = user.id === selectedUserId;
                    return (
                      <div
                        key={user.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedUserId(user.id)}
                        onKeyDown={(event) => handleUserCardKeyDown(event, user.id)}
                        className={cn(
                          "group relative cursor-pointer rounded-xl border px-3 py-3 text-left transition-all focus-visible:ring-2 focus-visible:ring-primary",
                          isSelected
                            ? "border-primary/60 bg-gradient-to-br from-primary/10 to-primary/5 shadow-[0_12px_24px_rgba(0,121,107,0.2)]"
                            : "border-border/60 bg-card hover:border-primary/40"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-foreground">{user.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {formatCurrency(metrics.todayUsage, currencyCode)} ·{" "}
                              {metrics.todayCalls.toLocaleString()} 次
                            </p>
                          </div>
                          <ChevronRight
                            className={cn(
                              "h-4 w-4 text-muted-foreground transition-colors",
                              isSelected && "text-primary"
                            )}
                          />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                          <span>
                            启用 {metrics.activeKeyCount}/{metrics.totalKeys}
                          </span>
                          <span>
                            最近{" "}
                            {metrics.lastActivity ? (
                              <RelativeTime date={metrics.lastActivity} />
                            ) : (
                              "暂无"
                            )}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          <Badge
                            variant={statusBadge.variant}
                            className={cn(
                              "rounded-full px-2 py-0 text-[10px]",
                              statusBadge.className
                            )}
                          >
                            {statusBadge.label}
                          </Badge>
                          {user.providerGroup && (
                            <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">
                              {user.providerGroup}
                            </Badge>
                          )}
                          {user.tags?.slice(0, 2).map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="rounded-full px-2 py-0 text-[10px]"
                            >
                              {tag}
                            </Badge>
                          ))}
                          {user.tags && user.tags.length > 2 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{user.tags.length - 2}
                            </span>
                          )}
                        </div>
                        {currentUser.role === "admin" && (
                          <div className="mt-2 flex items-center gap-1 text-[11px]">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 rounded-full px-2"
                              onClick={(event) => handleQuickToggle(event, user)}
                            >
                              {user.status === "active" ? "禁用" : "启用"}
                            </Button>
                            <div onClick={(event) => event.stopPropagation()}>
                              <UserActions
                                user={user}
                                currentUser={currentUser}
                                providerGroupOptions={combinedProviderGroups}
                                availableTags={availableTags}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                {selectedUser ? (
                  <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                    <div className="flex flex-col gap-4 border-b border-border/40 pb-5 lg:flex-row lg:items-start lg:justify-between">
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
                        <div className="inline-flex items-center gap-2 rounded-full bg-muted/20 px-3 py-1 text-xs">
                          过期时间：{formatExpiresAt(selectedUser.expiresAt)}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                          {currentUser.role === "admin" && (
                            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-1">
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
                          className="rounded-md border border-border/50 bg-muted/10 px-4 py-3"
                        >
                          <p className="text-xs text-muted-foreground">{metric.label}</p>
                          <p className="text-base font-semibold text-foreground">{metric.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6">
                      <div className="rounded-2xl border border-border/50 bg-muted/10 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-foreground">密钥运行面板</p>
                            <p className="text-xs text-muted-foreground">
                              默认展示全宽表格，可直接查看额度、限额和异常状态
                            </p>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            统计范围：{metricLabelFull}
                          </div>
                        </div>
                        <div className="mt-4 space-y-4">
                          <KeyListHeader
                            activeUser={selectedUser}
                            currentUser={currentUser}
                            canManageActiveUser={currentUser?.role === "admin"}
                            currencyCode={currencyCode}
                            showUserActions={false}
                            metricLabel={metricLabel}
                            providerGroupOptions={combinedProviderGroups}
                            availableTags={availableTags}
                          />
                          <KeyList
                            keys={selectedUser.keys}
                            user={selectedUser}
                            currentUser={currentUser}
                            keyOwnerUserId={selectedUser.id}
                            allowManageKeys={currentUser?.role === "admin"}
                            currencyCode={currencyCode}
                            metricLabel={metricLabel}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 py-12 text-center text-sm text-muted-foreground">
                    请选择上方用户查看详情
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-inner">
                <DataPagination
                  page={page}
                  pageSize={pageSize}
                  total={filteredUsers.length}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  pageSizeOptions={[5, 10, 20, 50]}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
