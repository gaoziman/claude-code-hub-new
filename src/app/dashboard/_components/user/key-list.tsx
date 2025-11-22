"use client";
import { useMemo, useState, type ReactNode } from "react";
import { DataTable, TableColumnTypes } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Copy, Check, BarChart3, Info, Clock4, Wallet } from "lucide-react";
import { KeyActions } from "./key-actions";
import type { UserKeyDisplay, UserDisplay } from "@/types/user";
import type { User } from "@/types/user";
import { RelativeTime } from "@/components/ui/relative-time";
import { formatCurrency, type CurrencyCode } from "@/lib/utils/currency";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { addDays, addMonths, addWeeks, startOfMonth, startOfWeek } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { getResetInfoForBillingPeriod } from "@/lib/rate-limit/time-utils";

interface KeyListProps {
  keys: UserKeyDisplay[];
  user: UserDisplay; // 当前显示的用户（包含用户级别限额和聚合消费数据）
  currentUser?: User;
  keyOwnerUserId: number; // 这些Key所属的用户ID
  allowManageKeys?: boolean;
  currencyCode?: CurrencyCode;
  metricLabel?: string;
  onSelectKey?: (key: UserKeyDisplay) => void;
  showDetailAction?: boolean;
}

export function KeyList({
  keys,
  user,
  currentUser,
  keyOwnerUserId,
  allowManageKeys = false,
  currencyCode = "USD",
  metricLabel = "今日",
  onSelectKey,
  showDetailAction = false,
}: KeyListProps) {
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null);
  const [modelStatsKey, setModelStatsKey] = useState<UserKeyDisplay | null>(null);
  const canDeleteKeys = keys.length > 1;

  const handleCopyKey = async (key: UserKeyDisplay) => {
    if (!key.fullKey || !key.canCopy) return;

    try {
      await copyToClipboard(key.fullKey);
      setCopiedKeyId(key.id);
      setTimeout(() => setCopiedKeyId(null), 2000);
    } catch (err) {
      console.error("复制失败:", err);
    }
  };

  const rangeCallLabel = `${metricLabel}调用`;
  const rangeUsageLabel = `${metricLabel}消耗`;
  const TIMEZONE = "Asia/Shanghai";

  const formatDurationText = (ms: number) => {
    if (ms <= 0) return "即将重置";
    const minutes = Math.floor(ms / 60000);
    const days = Math.floor(minutes / (60 * 24));
    const hours = Math.floor((minutes % (60 * 24)) / 60);
    const mins = minutes % 60;
    if (days > 0) {
      return `${days}天${hours}小时`;
    }
    if (hours > 0) {
      return `${hours}小时${mins}分`;
    }
    return `${mins}分钟`;
  };

  const getPeriodTimeMeta = (
    period: "weekly" | "monthly",
    billingCycleStart?: Date | null
  ) => {
    const now = new Date();

    // 使用账期周期计算（如果有设置），否则回退到自然周期
    const resetInfo = getResetInfoForBillingPeriod(period, billingCycleStart);

    if (resetInfo.type === "billing" && resetInfo.cycleStart && resetInfo.cycleEnd) {
      // 账期周期
      const start = resetInfo.cycleStart;
      const end = resetInfo.cycleEnd;
      const total = end.getTime() - start.getTime();
      const elapsed = now.getTime() - start.getTime();
      const percent = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0;
      const remaining = end.getTime() - now.getTime();
      return { percent, remainingText: formatDurationText(remaining) };
    }

    // 自然周期（回退逻辑）
    const zonedNow = toZonedTime(now, TIMEZONE);
    const startZoned =
      period === "weekly" ? startOfWeek(zonedNow, { weekStartsOn: 1 }) : startOfMonth(zonedNow);
    const endZoned = period === "weekly" ? addWeeks(startZoned, 1) : addMonths(startZoned, 1);
    const start = fromZonedTime(startZoned, TIMEZONE);
    const end = fromZonedTime(endZoned, TIMEZONE);
    const total = end.getTime() - start.getTime();
    const elapsed = now.getTime() - start.getTime();
    const percent = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0;
    const remaining = end.getTime() - now.getTime();
    return { percent, remainingText: formatDurationText(remaining) };
  };

  const getDailyTimeMeta = () => {
    const now = new Date();
    const zonedNow = toZonedTime(now, TIMEZONE);
    const startOfDay = fromZonedTime(
      new Date(zonedNow.getFullYear(), zonedNow.getMonth(), zonedNow.getDate(), 0, 0, 0, 0),
      TIMEZONE
    );
    const nextDay = addDays(startOfDay, 1);
    const total = nextDay.getTime() - startOfDay.getTime();
    const elapsed = now.getTime() - startOfDay.getTime();
    const percent = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0;
    const remaining = nextDay.getTime() - now.getTime();
    return { percent, remainingText: formatDurationText(remaining) };
  };

  const renderLimitBlock = (
    label: string,
    usage: number,
    limit: number,
    period: "daily" | "weekly" | "monthly" | "total",
    billingCycleStart?: Date | null
  ): ReactNode => {
    const percent = limit > 0 ? Math.min(100, (usage / limit) * 100) : 0;
    const timeMeta =
      period === "weekly"
        ? getPeriodTimeMeta("weekly", billingCycleStart)
        : period === "monthly"
          ? getPeriodTimeMeta("monthly", billingCycleStart)
          : period === "daily"
            ? getDailyTimeMeta()
            : null;
    const palette = {
      tag:
        period === "monthly"
          ? "bg-violet-100 text-violet-700"
          : period === "weekly"
            ? "bg-teal-100 text-teal-700"
            : period === "daily"
              ? "bg-orange-100 text-orange-700"
              : "bg-sky-100 text-sky-700",
      bar:
        period === "monthly"
          ? "bg-violet-500"
          : period === "weekly"
            ? "bg-teal-500"
            : period === "daily"
              ? "bg-orange-500"
              : "bg-sky-500",
    };
    return (
      <div className="space-y-0.5 w-full" key={label}>
        <div className="flex items-center justify-between gap-1.5 w-full">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium flex-shrink-0",
              palette.tag
            )}
          >
            {period === "total" ? <Wallet className="h-2.5 w-2.5" /> : <Clock4 className="h-2.5 w-2.5" />}{" "}
            {label}
            {timeMeta && (
              <span className="text-[9px] opacity-70">· {timeMeta.remainingText}</span>
            )}
          </span>
          <span className="text-[11px] font-semibold text-foreground whitespace-nowrap">
            {formatCurrency(usage ?? 0, currencyCode)} / {formatCurrency(limit ?? 0, currencyCode)}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted w-full">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${percent}%`, background: palette.bar }}
          />
        </div>
      </div>
    );
  };

  const renderLimitProgress = (record: UserKeyDisplay) => {
    // ========== 第一层：检查用户级别限额（最高优先级） ==========
    // 用户级别限额优先级：周 > 月 > 总
    const hasUserWeeklyLimit = user.limitWeeklyUsd != null && user.limitWeeklyUsd > 0;
    const hasUserMonthlyLimit = user.limitMonthlyUsd != null && user.limitMonthlyUsd > 0;
    const hasUserTotalLimit = user.totalLimitUsd != null && user.totalLimitUsd > 0;

    // 用户账期起始日期
    const userBillingCycleStart = user.billingCycleStart
      ? new Date(user.billingCycleStart)
      : null;

    // 优先级：用户周限额
    if (hasUserWeeklyLimit) {
      return renderLimitBlock(
        "用户周限额",
        user.userAggregateWeeklyUsage ?? 0,
        user.limitWeeklyUsd!,
        "weekly",
        userBillingCycleStart
      );
    }

    // 优先级：用户月限额
    if (hasUserMonthlyLimit) {
      return renderLimitBlock(
        "用户月限额",
        user.userAggregateMonthlyUsage ?? 0,
        user.limitMonthlyUsd!,
        "monthly",
        userBillingCycleStart
      );
    }

    // 优先级：用户总限额
    if (hasUserTotalLimit) {
      return renderLimitBlock(
        "用户总限额",
        user.userAggregateTotalUsage ?? 0,
        user.totalLimitUsd!,
        "total",
        userBillingCycleStart
      );
    }

    // ========== 第二层：回退到 Key 级别限额 ==========
    // Key 级别限额优先级：日 > 周 > 月 > 总
    const dailyLimit = record.dailyQuota && record.dailyQuota > 0 ? record.dailyQuota : null;
    const keyWeeklyLimit =
      record.limitWeeklyUsd && record.limitWeeklyUsd > 0 ? record.limitWeeklyUsd : null;
    const keyMonthlyLimit =
      record.limitMonthlyUsd && record.limitMonthlyUsd > 0 ? record.limitMonthlyUsd : null;
    const keyTotalLimit =
      record.totalLimitUsd && record.totalLimitUsd > 0 ? record.totalLimitUsd : null;

    // 优先级：Key 日额度
    if (dailyLimit) {
      return renderLimitBlock("Key 日额度", record.todayUsage ?? 0, dailyLimit, "daily", userBillingCycleStart);
    }

    // 优先级：Key 周额度
    if (keyWeeklyLimit) {
      return renderLimitBlock(
        "Key 周额度",
        record.weeklyUsageUsd ?? record.todayUsage ?? 0,
        keyWeeklyLimit,
        "weekly",
        userBillingCycleStart
      );
    }

    // 优先级：Key 月额度
    if (keyMonthlyLimit) {
      return renderLimitBlock(
        "Key 月额度",
        record.monthlyUsageUsd ?? record.todayUsage ?? 0,
        keyMonthlyLimit,
        "monthly",
        userBillingCycleStart
      );
    }

    // 优先级：Key 总费用
    if (keyTotalLimit) {
      return renderLimitBlock(
        "Key 总费用",
        record.totalUsageUsd ?? record.todayUsage ?? 0,
        keyTotalLimit,
        "total",
        userBillingCycleStart
      );
    }

    // 都没有设置限额
    return <div className="text-xs text-muted-foreground">未设置限额</div>;
  };

  const dialogContent = useMemo(() => {
    if (!modelStatsKey) return null;
    const stats = modelStatsKey.modelStats ?? [];
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          <p>
            Key：<span className="font-medium text-foreground">{modelStatsKey.name}</span>
          </p>
          <p>
            当前周期用量：{" "}
            <span className="font-medium text-foreground">
              {formatCurrency(modelStatsKey.todayUsage ?? 0, currencyCode)}
            </span>
          </p>
        </div>
        {stats.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
            暂无模型统计数据
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-background shadow-sm">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 text-sm font-medium">
              <span>模型统计</span>
              <span className="text-muted-foreground">{stats.length} 个模型</span>
            </div>
            <table className="w-full table-fixed text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">模型</th>
                  <th className="px-4 py-2 text-right font-medium">调用次数</th>
                  <th className="px-4 py-2 text-right font-medium">消耗</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((stat) => (
                  <tr key={`${modelStatsKey.id}-${stat.model}`} className="border-t text-sm">
                    <td className="px-4 py-2 font-mono text-xs">{stat.model}</td>
                    <td className="px-4 py-2 text-right">{stat.callCount.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatCurrency(stat.totalCost ?? 0, currencyCode)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }, [modelStatsKey, currencyCode]);

  const columns = [
    TableColumnTypes.text<UserKeyDisplay>("name", "名称", {
      width: "120px",
      className: "align-middle px-3 py-2",
      render: (value, record) => {
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <div className="truncate text-sm font-semibold text-foreground">{value}</div>
              {record.scope === "owner" && (
                <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200 px-1.5 py-0">
                  主Key
                </Badge>
              )}
            </div>
            {record.status === "disabled" && (
              <Badge variant="outline" className="text-[10px] text-orange-600 px-1.5 py-0">
                {record.disabledReason === "user_disabled"
                  ? "用户禁用"
                  : record.disabledReason === "user_expired"
                    ? "用户过期"
                    : "已禁用"}
              </Badge>
            )}
          </div>
        );
      },
    }),
    TableColumnTypes.text<UserKeyDisplay>("maskedKey", "Key", {
      width: "80px",
      className: "align-middle px-3 py-2",
      align: "center",
      render: (_, record: UserKeyDisplay) => (
        <div className="group inline-flex items-center gap-2">
          <div className="font-mono text-xs truncate">{record.maskedKey || "-"}</div>
          {record.canCopy && record.fullKey && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopyKey(record)}
              className="h-6 w-6 p-0 hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              title="复制完整密钥"
            >
              {copiedKeyId === record.id ? (
                <Check className="h-3 w-3 text-green-600" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>
      ),
    }),
    TableColumnTypes.text<UserKeyDisplay>("todayCallCount", rangeCallLabel, {
      width: "80px",
      className: "align-middle px-3 py-2 text-center",
      align: "center",
      render: (value) => (
        <div className="text-sm">{typeof value === "number" ? value.toLocaleString() : 0} 次</div>
      ),
    }),
    TableColumnTypes.number<UserKeyDisplay>("todayUsage", rangeUsageLabel, {
      width: "80px",
      className: "align-middle px-3 py-2 text-right",
      align: "center",
      render: (value) => {
        const amount = typeof value === "number" ? value : 0;
        return <div className="text-sm font-semibold">{formatCurrency(amount, currencyCode)}</div>;
      },
    }),
    TableColumnTypes.text<UserKeyDisplay>("lastUsedAt", "最后使用", {
      width: "80px",
      className: "align-middle px-3 py-2",
      align: "center",
      render: (_, record: UserKeyDisplay) => (
        <div className="space-y-0.5">
          {record.lastUsedAt ? (
            <>
              <div className="text-sm">
                <RelativeTime date={record.lastUsedAt} />
              </div>
              {record.lastProviderName && (
                <div className="text-xs text-muted-foreground truncate" title={record.lastProviderName}>
                  {record.lastProviderName}
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">未使用</div>
          )}
        </div>
      ),
    }),
    TableColumnTypes.text<UserKeyDisplay>("limitProgress", "限额进度", {
      width: "150px",
      className: "align-middle px-3 py-2",
      align: "center",
      render: (_, record) => renderLimitProgress(record),
    }),
    TableColumnTypes.actions<UserKeyDisplay>(
      "操作",
      (value, record) => (
        <div className="flex items-center justify-end gap-1.5">
          {showDetailAction && onSelectKey && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-14 text-xs px-2"
              title="查看详情"
              onClick={() => onSelectKey(record)}
            >
              <Info className="mr-0.5 h-3 w-3" />
              详情
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-14 text-xs px-2"
            title="查看模型统计"
            onClick={() => setModelStatsKey(record)}
          >
            <BarChart3 className="h-3 w-3 mr-0.5" />
            模型
          </Button>
          <KeyActions
            keyData={record}
            currentUser={currentUser}
            keyOwnerUserId={keyOwnerUserId}
            canDelete={canDeleteKeys}
            showLabels
            allowManage={
              currentUser?.role === "admin" ||
              (allowManageKeys && currentUser?.id === keyOwnerUserId)
            }
          />
        </div>
      ),
      { width: "150px", className: "align-middle px-3 py-2", align: "center" }
    ),
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={keys}
        rowClassName={(record) => (record.status === "disabled" ? "opacity-60" : "")}
        emptyState={{
          title: "暂无 Key",
          description: '可点击右上角 "新增 Key" 按钮添加密钥',
        }}
        maxHeight="600px"
        stickyHeader
        minWidth="1300px"
      />
      <Dialog
        open={Boolean(modelStatsKey)}
        onOpenChange={(open) => !open && setModelStatsKey(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>模型使用情况</DialogTitle>
            <DialogDescription>展示该密钥在当前统计范围内的模型调用情况</DialogDescription>
          </DialogHeader>
          {dialogContent}
        </DialogContent>
      </Dialog>
    </>
  );
}
