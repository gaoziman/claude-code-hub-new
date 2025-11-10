"use client";
import { useMemo, useState } from "react";
import { DataTable, TableColumnTypes } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Copy, Check, BarChart3, Info } from "lucide-react";
import { KeyActions } from "./key-actions";
import type { UserKeyDisplay } from "@/types/user";
import type { User } from "@/types/user";
import { RelativeTime } from "@/components/ui/relative-time";
import { formatCurrency, type CurrencyCode } from "@/lib/utils/currency";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface KeyListProps {
  keys: UserKeyDisplay[];
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
      await navigator.clipboard.writeText(key.fullKey);
      setCopiedKeyId(key.id);
      setTimeout(() => setCopiedKeyId(null), 2000);
    } catch (err) {
      console.error("复制失败:", err);
    }
  };

  const rangeCallLabel = `${metricLabel}调用`;
  const rangeUsageLabel = `${metricLabel}消耗`;

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
      width: "26%",
      className: "align-middle",
      render: (value, record) => {
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="truncate text-sm font-semibold text-foreground">{value}</div>
              {record.status === "disabled" && (
                <Badge variant="outline" className="text-[11px] text-orange-600">
                  {record.disabledReason === "user_disabled"
                    ? "用户禁用"
                    : record.disabledReason === "user_expired"
                      ? "用户过期"
                      : "已禁用"}
                </Badge>
              )}
            </div>
          </div>
        );
      },
    }),
    TableColumnTypes.text<UserKeyDisplay>("maskedKey", "Key", {
      width: "26%",
      className: "align-middle",
      render: (_, record: UserKeyDisplay) => (
        <div className="group inline-flex items-center gap-1">
          <div className="font-mono truncate">{record.maskedKey || "-"}</div>
          {record.canCopy && record.fullKey && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopyKey(record)}
              className="h-5 w-5 p-0 hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
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
      width: "12%",
      className: "align-middle",
      render: (value) => (
        <div className="text-sm">{typeof value === "number" ? value.toLocaleString() : 0} 次</div>
      ),
    }),
    TableColumnTypes.number<UserKeyDisplay>("todayUsage", rangeUsageLabel, {
      width: "14%",
      className: "align-middle pr-4",
      render: (value) => {
        const amount = typeof value === "number" ? value : 0;
        return <div className="text-sm">{formatCurrency(amount, currencyCode)}</div>;
      },
    }),
    TableColumnTypes.text<UserKeyDisplay>("lastUsedAt", "最后使用", {
      width: "18%",
      className: "align-middle pl-4",
      render: (_, record: UserKeyDisplay) => (
        <div className="space-y-0.5">
          {record.lastUsedAt ? (
            <>
              <div className="text-sm">
                <RelativeTime date={record.lastUsedAt} />
              </div>
              {record.lastProviderName && (
                <div className="text-xs text-muted-foreground">
                  供应商: {record.lastProviderName}
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">未使用</div>
          )}
        </div>
      ),
    }),
    TableColumnTypes.actions<UserKeyDisplay>("操作", (value, record) => (
      <div className="flex items-center gap-1">
        {showDetailAction && onSelectKey && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            title="查看详情"
            onClick={() => onSelectKey(record)}
          >
            <Info className="mr-1 h-3.5 w-3.5" />
            详情
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          title="查看模型统计"
          onClick={() => setModelStatsKey(record)}
        >
          <BarChart3 className="h-3.5 w-3.5 mr-1" />
          模型
        </Button>
        <KeyActions
          keyData={record}
          currentUser={currentUser}
          keyOwnerUserId={keyOwnerUserId}
          canDelete={canDeleteKeys}
          showLabels
          allowManage={currentUser?.role === "admin" || (allowManageKeys && currentUser?.id === keyOwnerUserId)}
        />
      </div>
    )),
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
      />
      <Dialog open={Boolean(modelStatsKey)} onOpenChange={(open) => !open && setModelStatsKey(null)}>
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
