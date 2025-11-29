"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import type { User, UserDisplay, UserKeyDisplay } from "@/types/user";
import { KeyListHeader } from "../../_components/user/key-list-header";
import { KeyList } from "../../_components/user/key-list";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency, type CurrencyCode } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { RelativeTime } from "@/components/ui/relative-time";
import { toast } from "sonner";
import { AlertTriangle, ShieldCheck, RefreshCw, BarChart3 } from "lucide-react";
import { USAGE_TIME_RANGE_META, type UsageTimeRangeValue } from "@/lib/time-range";
import { fetchCurrentUserByTimeRange, getUserMetrics } from "../../_lib/user-data";

type StatusFilter = "all" | "enabled" | "disabled" | "expiring";
type LoginFilter = "all" | "login" | "api";

interface KeyWorkspaceProps {
  initialUsers: UserDisplay[];
  currentUser: User;
  viewMode: "user" | "key";
  currencyCode?: CurrencyCode;
  initialTimeRange: UsageTimeRangeValue;
}

export function KeyWorkspace({
  initialUsers,
  currentUser,
  viewMode,
  currencyCode = "USD",
  initialTimeRange,
}: KeyWorkspaceProps) {
  const preferredUserId = currentUser.id;
  const [users, setUsers] = useState<UserDisplay[]>(initialUsers);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(() => {
    const matched = initialUsers.find((user) => user.id === preferredUserId);
    return matched?.id ?? initialUsers[0]?.id ?? null;
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loginFilter, setLoginFilter] = useState<LoginFilter>("all");
  const [timeRange, setTimeRange] = useState<UsageTimeRangeValue>(initialTimeRange);
  const [selectedKey, setSelectedKey] = useState<UserKeyDisplay | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setUsers(initialUsers);
    setSelectedUserId((prev) => {
      if (prev && initialUsers.some((user) => user.id === prev)) {
        return prev;
      }
      const matched = initialUsers.find((user) => user.id === preferredUserId);
      return matched?.id ?? initialUsers[0]?.id ?? null;
    });
  }, [initialUsers, preferredUserId]);

  const activeUser = useMemo(() => {
    if (selectedUserId === null) {
      return users[0] ?? null;
    }
    return users.find((user) => user.id === selectedUserId) ?? users[0] ?? null;
  }, [users, selectedUserId]);

  const metricMeta =
    USAGE_TIME_RANGE_META.find((meta) => meta.value === timeRange) ?? USAGE_TIME_RANGE_META[0];

  const keys = useMemo(() => activeUser?.keys ?? [], [activeUser]);

  const filteredKeys = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return keys.filter((key) => {
      if (normalizedSearch) {
        const haystack = `${key.name} ${key.maskedKey} ${key.fullKey ?? ""}`.toLowerCase();
        if (!haystack.includes(normalizedSearch)) {
          return false;
        }
      }

      if (statusFilter === "enabled" && key.status !== "enabled") {
        return false;
      }
      if (statusFilter === "disabled" && key.status !== "disabled") {
        return false;
      }
      if (statusFilter === "expiring" && !isKeyExpiringSoon(key)) {
        return false;
      }

      if (loginFilter === "login" && !key.canLoginWebUi) {
        return false;
      }
      if (loginFilter === "api" && key.canLoginWebUi) {
        return false;
      }

      return true;
    });
  }, [keys, searchTerm, statusFilter, loginFilter]);

  const expiringKeys = useMemo(() => keys.filter((key) => isKeyExpiringSoon(key)), [keys]);
  const disabledKeys = useMemo(() => keys.filter((key) => key.status === "disabled"), [keys]);

  const handleTimeRangeChange = (value: UsageTimeRangeValue) => {
    if (value === timeRange) return;
    startTransition(async () => {
      try {
        // ⭐ API 密钥页面：只获取当前用户自己的数据
        const currentUserData = await fetchCurrentUserByTimeRange(value);
        if (!currentUserData) {
          toast.error("无法加载用户数据");
          return;
        }
        const nextUsers = [currentUserData]; // 包装成数组
        setUsers(nextUsers);
        setSelectedUserId(currentUserData.id); // 固定选中当前用户
        setTimeRange(value);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "加载用户数据失败");
      }
    });
  };

  const handleManualRefresh = () => {
    startTransition(async () => {
      try {
        // ⭐ API 密钥页面：只获取当前用户自己的数据
        const currentUserData = await fetchCurrentUserByTimeRange(timeRange);
        if (!currentUserData) {
          toast.error("无法加载用户数据");
          return;
        }
        const nextUsers = [currentUserData]; // 包装成数组
        setUsers(nextUsers);
        setSelectedUserId(currentUserData.id); // 固定选中当前用户
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "刷新失败，请稍后重试");
      }
    });
  };

  const overviewMetrics = useMemo(
    () => (activeUser ? getUserMetrics(activeUser) : null),
    [activeUser]
  );

  const showUserSelect = currentUser.role === "admin" && users.length > 1;
  const allowManageKeys =
    currentUser.role === "admin" || (viewMode === "user" && activeUser?.id === currentUser.id);
  const canManageActiveUser =
    allowManageKeys && activeUser
      ? currentUser.role === "admin" || currentUser.id === activeUser.id
      : false;

  return (
    <div className="space-y-6">
      <KeyOverviewCards
        user={activeUser}
        metricLabel={metricMeta.shortLabel}
        currencyCode={currencyCode}
        metrics={overviewMetrics}
      />

      {activeUser && (
        <div className="space-y-3">
          {expiringKeys.length > 0 && (
            <Alert className="border-orange-300 bg-orange-50/60">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>有 {expiringKeys.length} 个密钥即将过期</AlertTitle>
              <AlertDescription>
                {expiringKeys
                  .slice(0, 3)
                  .map((key) => key.name)
                  .join("、")}
                {expiringKeys.length > 3 ? ` 等 ${expiringKeys.length} 个密钥` : ""}。
                建议提前创建新的密钥或延长有效期。
              </AlertDescription>
            </Alert>
          )}
          {disabledKeys.length > 0 && (
            <Alert className="border-amber-200 bg-amber-50/60">
              <ShieldCheck className="h-4 w-4 text-amber-500" />
              <AlertTitle>已停用 {disabledKeys.length} 个密钥</AlertTitle>
              <AlertDescription>
                如果需要重新启用，请在列表中点击“编辑”或联系管理员。
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <Card className="border-border/70 p-4 shadow-sm">
        <div className="space-y-4">
          <KeyListHeader
            activeUser={activeUser}
            currentUser={currentUser}
            canManageActiveUser={canManageActiveUser}
            showUserActions={currentUser.role === "admin"}
            currencyCode={currencyCode}
            metricLabel={metricMeta.shortLabel}
          />

          <KeyFilterBar
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            loginFilter={loginFilter}
            onLoginFilterChange={setLoginFilter}
            timeRange={timeRange}
            onTimeRangeChange={handleTimeRangeChange}
            isUpdating={isPending}
            onRefresh={handleManualRefresh}
            users={users}
            selectedUserId={selectedUserId}
            onUserChange={setSelectedUserId}
            showUserSelect={showUserSelect}
          />

          <KeyList
            keys={filteredKeys}
            user={activeUser!}
            currentUser={currentUser}
            keyOwnerUserId={activeUser?.id ?? currentUser.id}
            allowManageKeys={allowManageKeys}
            currencyCode={currencyCode}
            metricLabel={metricMeta.shortLabel}
            onSelectKey={setSelectedKey}
            showDetailAction
          />
        </div>
      </Card>

      <KeyUsageInsights
        keys={filteredKeys}
        currencyCode={currencyCode}
        metricLabel={metricMeta.shortLabel}
      />

      <KeyDetailSheet
        keyData={selectedKey}
        user={activeUser}
        open={Boolean(selectedKey)}
        onOpenChange={(open) => !open && setSelectedKey(null)}
        currencyCode={currencyCode}
        metricLabel={metricMeta.shortLabel}
      />
    </div>
  );
}

interface KeyOverviewCardsProps {
  user: UserDisplay | null;
  currencyCode: CurrencyCode;
  metricLabel: string;
  metrics: ReturnType<typeof getUserMetrics> | null;
}

function KeyOverviewCards({ user, currencyCode, metricLabel, metrics }: KeyOverviewCardsProps) {
  if (!user || !metrics) {
    return null;
  }

  const cards: { label: string; value: ReactNode; hint: ReactNode }[] = [
    {
      label: "密钥总数",
      value: `${metrics.totalKeys}`,
      hint: `启用 ${metrics.activeKeyCount}`,
    },
    {
      label: `${metricLabel}调用`,
      value: `${metrics.todayCalls.toLocaleString()} 次`,
      hint: `${metricLabel}累计调用`,
    },
    {
      label: `${metricLabel}消耗`,
      value: formatCurrency(metrics.todayUsage, currencyCode),
      hint: `${metricLabel}期间的 Token 成本`,
    },
    {
      label: "最近使用",
      value: metrics.lastActivity ? <RelativeTime date={metrics.lastActivity} /> : "暂无记录",
      hint: metrics.lastActivity ? metrics.lastActivity.toLocaleString("zh-CN") : "等待首次调用",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((item) => (
        <Card key={item.label} className="border-border/70 p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">{item.label}</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{item.value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{item.hint}</div>
        </Card>
      ))}
    </div>
  );
}

interface KeyFilterBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  loginFilter: LoginFilter;
  onLoginFilterChange: (value: LoginFilter) => void;
  timeRange: UsageTimeRangeValue;
  onTimeRangeChange: (value: UsageTimeRangeValue) => void;
  isUpdating: boolean;
  onRefresh: () => void;
  users: UserDisplay[];
  selectedUserId: number | null;
  onUserChange: (id: number | null) => void;
  showUserSelect: boolean;
}

function KeyFilterBar({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusChange,
  loginFilter,
  onLoginFilterChange,
  timeRange,
  onTimeRangeChange,
  isUpdating,
  onRefresh,
  users,
  selectedUserId,
  onUserChange,
  showUserSelect,
}: KeyFilterBarProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索密钥名称 / Key"
          className="min-w-[200px] flex-1"
        />
        <Select
          value={statusFilter}
          onValueChange={(value) => onStatusChange(value as StatusFilter)}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="enabled">仅启用</SelectItem>
            <SelectItem value="disabled">已禁用</SelectItem>
            <SelectItem value="expiring">即将过期</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={loginFilter}
          onValueChange={(value) => onLoginFilterChange(value as LoginFilter)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="登录权限" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部密钥</SelectItem>
            <SelectItem value="login">允许登录 Web</SelectItem>
            <SelectItem value="api">仅限 API</SelectItem>
          </SelectContent>
        </Select>
        {showUserSelect && (
          <Select
            value={selectedUserId ? String(selectedUserId) : ""}
            onValueChange={(value) => onUserChange(value ? Number(value) : null)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="选择用户" />
            </SelectTrigger>
            <SelectContent>
              {users.map((user) => (
                <SelectItem key={user.id} value={String(user.id)}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={timeRange}
          onValueChange={(value) => onTimeRangeChange(value as UsageTimeRangeValue)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="统计区间" />
          </SelectTrigger>
          <SelectContent>
            {USAGE_TIME_RANGE_META.map((meta) => (
              <SelectItem key={meta.value} value={meta.value}>
                {meta.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isUpdating}>
          <RefreshCw className={cn("mr-2 h-3.5 w-3.5", isUpdating && "animate-spin")} />
          刷新
        </Button>
      </div>
    </div>
  );
}

interface KeyUsageInsightsProps {
  keys: UserKeyDisplay[];
  currencyCode: CurrencyCode;
  metricLabel: string;
}

function KeyUsageInsights({ keys, currencyCode, metricLabel }: KeyUsageInsightsProps) {
  if (keys.length === 0) {
    return (
      <Card className="border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
        暂无密钥数据，创建密钥后即可查看使用洞察。
      </Card>
    );
  }

  const topKeys = [...keys].sort((a, b) => (b.todayUsage ?? 0) - (a.todayUsage ?? 0)).slice(0, 5);

  const modelMap = new Map<string, { callCount: number; totalCost: number }>();
  keys.forEach((key) => {
    key.modelStats?.forEach((stat) => {
      const existing = modelMap.get(stat.model) || { callCount: 0, totalCost: 0 };
      existing.callCount += stat.callCount;
      existing.totalCost += stat.totalCost ?? 0;
      modelMap.set(stat.model, existing);
    });
  });
  const topModels = Array.from(modelMap.entries())
    .map(([model, value]) => ({ model, ...value }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 5);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-border/70 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BarChart3 className="h-4 w-4" />
          {metricLabel}密钥消耗排行
        </div>
        <div className="mt-4 space-y-3">
          {topKeys.map((key) => (
            <div key={key.id} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{key.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatCurrency(key.todayUsage ?? 0, currencyCode)}
                </span>
              </div>
              <Progress
                value={calculatePercentage(key.todayUsage ?? 0, topKeys[0]?.todayUsage ?? 1)}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card className="border-border/70 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4" />
          模型调用构成
        </div>
        {topModels.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">当前统计区间内暂无模型调用。</p>
        ) : (
          <div className="mt-4 space-y-3">
            {topModels.map((item) => (
              <div key={item.model} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{item.model}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.callCount.toLocaleString()} 次 ·{" "}
                    {formatCurrency(item.totalCost, currencyCode)}
                  </span>
                </div>
                <Progress
                  value={calculatePercentage(item.totalCost, topModels[0]?.totalCost ?? 1)}
                />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

interface KeyDetailSheetProps {
  keyData: UserKeyDisplay | null;
  user: UserDisplay | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currencyCode: CurrencyCode;
  metricLabel: string;
}

function KeyDetailSheet({
  keyData,
  user,
  open,
  onOpenChange,
  currencyCode,
  metricLabel,
}: KeyDetailSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">{keyData?.name ?? "密钥详情"}</DialogTitle>
          <DialogDescription>查看限流配置、调用状态与安全信息</DialogDescription>
        </DialogHeader>
        {keyData ? (
          <div className="space-y-6 py-2">
            {/* 密钥信息卡片 */}
            <div className="rounded-xl border border-border/60 bg-gradient-to-br from-muted/40 to-muted/20 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">密钥字符串</div>
                  <div className="rounded-lg bg-background/80 p-3 font-mono text-sm backdrop-blur-sm">
                    {keyData.maskedKey}
                  </div>
                </div>
                <div className="flex flex-col gap-2 text-right">
                  <Badge
                    variant={keyData.status === "enabled" ? "default" : "outline"}
                    className="w-fit"
                  >
                    {keyData.status === "enabled" ? "✓ 启用" : "✕ 禁用"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    创建于 {keyData.createdAtFormatted}
                  </span>
                </div>
              </div>
            </div>

            {/* 使用情况统计 */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label={`${metricLabel}调用`}
                value={`${(keyData.todayCallCount ?? 0).toLocaleString()} 次`}
                icon="📊"
              />
              <StatCard
                label={`${metricLabel}消耗`}
                value={formatCurrency(keyData.todayUsage ?? 0, currencyCode)}
                icon="💰"
              />
              <StatCard
                label="最近使用"
                value={keyData.lastUsedAt ? <RelativeTime date={keyData.lastUsedAt} /> : "暂无记录"}
                icon="⏰"
              />
              <StatCard label="最后供应商" value={keyData.lastProviderName ?? "--"} icon="🔌" />
            </div>

            {/* 限流与额度 */}
            <div className="rounded-xl border border-border/60 bg-card p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <span className="text-lg">⚡</span>
                限流与额度
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <InfoCard
                  label="RPM 限制"
                  value={keyData.rpmLimit ? `${keyData.rpmLimit} rpm` : "未设置"}
                />
                <InfoCard
                  label="每日额度"
                  value={
                    keyData.dailyQuota
                      ? `${formatCurrency(keyData.dailyQuota, currencyCode)}`
                      : "未设置"
                  }
                />
                <InfoCard
                  label="5 小时上限"
                  {...(() => {
                    const display = getLimitDisplayWithSource(
                      user?.limit5hUsd,
                      keyData.limit5hUsd,
                      currencyCode
                    );
                    return { value: display.value, source: display.source };
                  })()}
                />
                <InfoCard
                  label="周消费上限"
                  {...(() => {
                    const display = getLimitDisplayWithSource(
                      user?.limitWeeklyUsd,
                      keyData.limitWeeklyUsd,
                      currencyCode
                    );
                    return { value: display.value, source: display.source };
                  })()}
                />
                <InfoCard
                  label="月消费上限"
                  {...(() => {
                    const display = getLimitDisplayWithSource(
                      user?.limitMonthlyUsd,
                      keyData.limitMonthlyUsd,
                      currencyCode
                    );
                    return { value: display.value, source: display.source };
                  })()}
                />
                <InfoCard
                  label="总费用上限"
                  {...(() => {
                    const display = getLimitDisplayWithSource(
                      user?.totalLimitUsd,
                      keyData.totalLimitUsd,
                      currencyCode
                    );
                    return { value: display.value, source: display.source };
                  })()}
                />
                <InfoCard label="并发会话" value={keyData.limitConcurrentSessions || "未设置"} />
              </div>
            </div>

            {/* 模型统计 */}
            {keyData.modelStats && keyData.modelStats.length > 0 && (
              <div className="rounded-xl border border-border/60 bg-card p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                  <span className="text-lg">📈</span>
                  模型 Top 3
                </h3>
                <div className="space-y-3">
                  {keyData.modelStats.slice(0, 3).map((stat, index) => (
                    <div
                      key={stat.model}
                      className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/30 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {index + 1}
                        </div>
                        <span className="font-mono text-sm font-medium">{stat.model}</span>
                      </div>
                      <span className="text-sm font-semibold">
                        {stat.callCount.toLocaleString()} 次
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 安全设置 */}
            <div className="rounded-xl border border-border/60 bg-card p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <span className="text-lg">🔒</span>
                安全设置
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <Badge
                  variant={keyData.canLoginWebUi ? "default" : "secondary"}
                  className="px-3 py-1"
                >
                  {keyData.canLoginWebUi ? "✓ 允许登录 Web UI" : "✕ 仅限 API 调用"}
                </Badge>
                <Badge variant="outline" className="px-3 py-1">
                  {keyData.expiresAt === "永不过期"
                    ? "♾️ 永不过期"
                    : `⏳ 过期时间 ${keyData.expiresAt}`}
                </Badge>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center text-muted-foreground">
              <div className="mb-2 text-4xl">🔑</div>
              <p className="text-sm">请选择一个密钥查看详情</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ label, value, icon }: { label: string; value: ReactNode; icon: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function InfoCard({
  label,
  value,
  source,
}: {
  label: string;
  value: ReactNode;
  source?: "用户" | "Key" | null;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {source && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {source}
          </Badge>
        )}
      </div>
      <div className="text-sm font-medium text-foreground">{value ?? "--"}</div>
    </div>
  );
}

function limitValueText(value: number | null | undefined, currencyCode: CurrencyCode) {
  if (value === null || value === undefined || value === 0) {
    return "未设置";
  }
  return formatCurrency(value, currencyCode);
}

/**
 * 获取限额显示值（用户级别优先，Key 级别降级）
 * @param userLimit 用户级别限额
 * @param keyLimit Key 级别限额
 * @param currencyCode 货币代码
 * @returns { value: 显示值, source: 来源标识 }
 */
function getLimitDisplayWithSource(
  userLimit: number | null | undefined,
  keyLimit: number | null | undefined,
  currencyCode: CurrencyCode
): { value: ReactNode; source: "用户" | "Key" | null } {
  // 优先显示用户级别限额
  if (userLimit !== null && userLimit !== undefined && userLimit > 0) {
    return {
      value: formatCurrency(userLimit, currencyCode),
      source: "用户",
    };
  }

  // 降级到 Key 级别限额
  if (keyLimit !== null && keyLimit !== undefined && keyLimit > 0) {
    return {
      value: formatCurrency(keyLimit, currencyCode),
      source: "Key",
    };
  }

  // 都未设置
  return { value: "未设置", source: null };
}

function calculatePercentage(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((value / max) * 100));
}

function isKeyExpiringSoon(key: UserKeyDisplay) {
  if (!key.expiresAt || key.expiresAt === "永不过期") {
    return false;
  }
  const expiresAt = new Date(key.expiresAt);
  const now = Date.now();
  const diff = expiresAt.getTime() - now;
  const fiveDays = 1000 * 60 * 60 * 24 * 7;
  return diff > 0 && diff <= fiveDays;
}
