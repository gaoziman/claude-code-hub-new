"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ComponentType,
  type KeyboardEvent,
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
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RelativeTime } from "@/components/ui/relative-time";
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Infinity as InfinityIcon,
  ListPlus,
  Search,
  Wallet,
  Key,
  Phone,
  DollarSign,
  Clock,
} from "lucide-react";
import { AddUserDialog } from "../../_components/user/add-user-dialog";
import { KeyList } from "../../_components/user/key-list";
import { UserActions } from "../../_components/user/user-actions";
import { AddKeyForm } from "../../_components/user/forms/add-key-form";
import type { UserDisplay } from "@/types/user";
import type { User } from "@/types/user";
import type { CurrencyCode } from "@/lib/utils/currency";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
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

  const [page, setPage] = useState(1);
  const [pageSize] = useState(8);
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
    <div className="space-y-4">
      {/* 页面标题和搜索筛选区 */}
      <div className="flex items-start justify-between gap-6">
        <div className="flex-shrink-0">
          <h1 className="text-2xl font-semibold text-foreground">用户管理</h1>
          <p className="text-sm text-muted-foreground">
            {summary.totalUsers} 个用户 · {summary.totalKeys} 个密钥 · {metricLabelFull}消耗 {formatCurrency(summary.todayCost, currencyCode)}
          </p>
        </div>

        {/* 搜索和筛选 */}
        <div className="flex-1 max-w-3xl">
          <div className="flex items-center gap-3">
            <div className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                placeholder="搜索用户或密钥"
                onChange={(event) => setSearchTerm(event.target.value)}
                className="h-full border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StatusFilter)}
            >
              <SelectTrigger className="h-9 w-[110px] rounded-lg border-slate-200 bg-white text-xs">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={timeRange}
              onValueChange={(value) => handleTimeRangeChange(value as UsageTimeRangeValue)}
            >
              <SelectTrigger disabled={isTimeChanging} className="h-9 w-[100px] rounded-lg border-slate-200 bg-white text-xs">
                <SelectValue placeholder="时间" />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableTags.length > 0 && (
              <Select
                value={tagFilter || "all"}
                onValueChange={(value) => setTagFilter(value === "all" ? "" : value)}
              >
                <SelectTrigger className="h-9 w-[100px] rounded-lg border-slate-200 bg-white text-xs">
                  <SelectValue placeholder="标签" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部标签</SelectItem>
                  {availableTags.map((tag) => (
                    <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {combinedProviderGroups.length > 0 && (
              <Select
                value={providerGroupFilter}
                onValueChange={(value) => setProviderGroupFilter(value as typeof providerGroupFilter)}
              >
                <SelectTrigger className="h-9 w-[100px] rounded-lg border-slate-200 bg-white text-xs">
                  <SelectValue placeholder="分组" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部分组</SelectItem>
                  {combinedProviderGroups.map((group) => (
                    <SelectItem key={group} value={group}>{group}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <AddUserDialog
          providerGroupOptions={combinedProviderGroups}
          availableTags={availableTags}
        />
      </div>

      {/* 双栏布局 */}
      <div className="flex gap-6" style={{ height: "calc(100vh - 200px)" }}>
        {/* 左侧：用户列表 */}
        <div className="w-[300px] flex-shrink-0 flex flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
          {/* 用户列表头部 */}
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <span className="text-sm font-medium text-foreground">用户列表</span>
            <span className="text-xs text-muted-foreground">{matchedUsersCount} 人</span>
          </div>

          {/* 用户列表（可滚动） */}
          <div className="flex-1 overflow-y-auto">
            {paginatedUsers.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                没有匹配的用户
              </div>
            ) : (
              <div className="p-2 space-y-2">
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
                        "group relative cursor-pointer rounded-lg border px-3 py-2.5 transition-all",
                        "focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                        isSelected
                          ? "border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                      )}
                    >
                      {/* 选中指示条 */}
                      {isSelected && (
                        <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-primary via-primary/80 to-primary/50" />
                      )}

                      <div className="flex items-start gap-3 pl-2">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          {/* 用户名和状态 */}
                          <div className="flex items-center gap-2">
                            <h3 className="truncate text-sm font-semibold text-foreground">
                              {user.name}
                            </h3>
                            <Badge
                              variant={statusBadge.variant}
                              className={cn(
                                "rounded-md px-1.5 py-0 text-[10px] font-medium",
                                statusBadge.className
                              )}
                            >
                              {statusBadge.label}
                            </Badge>
                          </div>

                          {/* 统计信息 */}
                          <div className="flex items-center gap-2 text-xs">
                            <div className="flex items-center gap-1">
                              <span className="font-medium text-foreground">
                                {formatCurrency(metrics.todayUsage, currencyCode)}
                              </span>
                            </div>
                            <span className="text-slate-400">·</span>
                            <span className="text-muted-foreground">
                              {metrics.todayCalls} 次
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-muted-foreground">
                              {metrics.activeKeyCount}/{metrics.totalKeys} Key
                            </span>
                          </div>
                        </div>

                        {/* 箭头指示器 */}
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 flex-shrink-0 transition-all",
                            isSelected
                              ? "text-primary translate-x-0.5"
                              : "text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5"
                          )}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 分页 */}
          <div className="border-t border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                共 <span className="font-medium text-foreground">{filteredUsers.length}</span> 条
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0 border-slate-200"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <div className="flex items-center justify-center min-w-[48px] h-7 px-2 text-xs font-medium bg-slate-100 rounded-md">
                  {page}/{Math.ceil(filteredUsers.length / pageSize) || 1}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0 border-slate-200"
                  disabled={page >= Math.ceil(filteredUsers.length / pageSize)}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：用户详情和密钥管理 */}
        <div className="flex-1 overflow-y-auto">
          {selectedUser ? (
            <div className="space-y-4">
              {/* 用户详情卡片 */}
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-foreground">{selectedUser.name}</h2>
                      <Badge
                        variant={getStatusBadge(selectedUser).variant}
                        className={getStatusBadge(selectedUser).className}
                      >
                        {getStatusBadge(selectedUser).label}
                      </Badge>
                      {selectedUser.providerGroup && (
                        <Badge variant="outline" className="text-xs">{selectedUser.providerGroup}</Badge>
                      )}
                      {selectedUser.tags?.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                    {selectedUser.note && (
                      <p className="mt-2 text-sm text-muted-foreground">{selectedUser.note}</p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      过期时间：{formatExpiresAt(selectedUser.expiresAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {currentUser.role === "admin" && (
                      <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5">
                        <span className="text-xs text-muted-foreground">
                          {selectedUser.status === "active" ? "启用" : "禁用"}
                        </span>
                        <Switch
                          checked={selectedUser.status === "active"}
                          onCheckedChange={(checked) => handleStatusToggle(selectedUser, checked)}
                          disabled={isStatusPending && pendingUserId === selectedUser.id}
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

                {/* 统计指标 - 精致卡片设计 */}
                <div className="mt-5 grid gap-3 grid-cols-5">
                  {[
                    {
                      label: "账户余额",
                      value: formatCurrency(selectedUser.balanceUsd ?? 0, currencyCode),
                      icon: Wallet,
                      gradient: "from-emerald-500/10 via-teal-500/5 to-transparent",
                      iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600",
                      iconColor: "text-white"
                    },
                    {
                      label: "启用密钥",
                      value: `${selectedMetrics?.activeKeyCount ?? 0}/${selectedMetrics?.totalKeys ?? 0}`,
                      icon: Key,
                      gradient: "from-blue-500/10 via-indigo-500/5 to-transparent",
                      iconBg: "bg-gradient-to-br from-blue-500 to-indigo-600",
                      iconColor: "text-white"
                    },
                    {
                      label: `${metricLabel}调用`,
                      value: `${(selectedMetrics?.todayCalls ?? 0).toLocaleString()} 次`,
                      icon: Phone,
                      gradient: "from-violet-500/10 via-purple-500/5 to-transparent",
                      iconBg: "bg-gradient-to-br from-violet-500 to-purple-600",
                      iconColor: "text-white"
                    },
                    {
                      label: `${metricLabel}消耗`,
                      value: formatCurrency(selectedMetrics?.todayUsage ?? 0, currencyCode),
                      icon: DollarSign,
                      gradient: "from-amber-500/10 via-orange-500/5 to-transparent",
                      iconBg: "bg-gradient-to-br from-amber-500 to-orange-600",
                      iconColor: "text-white"
                    },
                    {
                      label: "最近活跃",
                      value: selectedMetrics?.lastActivity ? <RelativeTime date={selectedMetrics.lastActivity} /> : "暂无",
                      icon: Clock,
                      gradient: "from-rose-500/10 via-pink-500/5 to-transparent",
                      iconBg: "bg-gradient-to-br from-rose-500 to-pink-600",
                      iconColor: "text-white"
                    },
                  ].map((metric) => {
                    const Icon = metric.icon;
                    return (
                      <div
                        key={metric.label}
                        className={cn(
                          "group relative overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br",
                          metric.gradient,
                          "backdrop-blur-sm transition-all duration-300",
                          "hover:shadow-lg hover:shadow-slate-200/50 hover:border-slate-300/80 hover:-translate-y-0.5"
                        )}
                      >
                        {/* 装饰性光晕效果 */}
                        <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/30 blur-2xl transition-transform duration-500 group-hover:scale-150" />

                        <div className="relative px-4 py-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-medium text-slate-600/90 uppercase tracking-wide mb-1.5">
                                {metric.label}
                              </p>
                              <p className="text-lg font-bold text-slate-900 tracking-tight truncate">
                                {metric.value}
                              </p>
                            </div>
                            <div className={cn(
                              "flex-shrink-0 rounded-lg p-2 shadow-sm",
                              metric.iconBg,
                              "transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                            )}>
                              <Icon className={cn("h-4 w-4", metric.iconColor)} strokeWidth={2.5} />
                            </div>
                          </div>
                        </div>

                        {/* 底部装饰线 */}
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-slate-300/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 密钥管理 */}
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">密钥列表</h3>
                    <p className="text-xs text-muted-foreground">
                      共 {selectedUser.keys.length} 个密钥 · 启用 {selectedUser.keys.filter(k => k.status === "enabled").length} 个
                    </p>
                  </div>
                  {currentUser?.role === "admin" && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" className="rounded-lg">
                          <ListPlus className="mr-1.5 h-3.5 w-3.5" />
                          新增 Key
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl md:max-w-3xl xl:max-w-4xl max-h-[90vh] overflow-y-auto">
                        <AddKeyForm userId={selectedUser.id} />
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
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
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50">
              <p className="text-sm text-muted-foreground">请从左侧选择用户查看详情</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
