"use client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ListPlus, Copy, CheckCircle } from "lucide-react";
import { AddKeyForm } from "./forms/add-key-form";
import { UserActions } from "./user-actions";
import type { UserDisplay } from "@/types/user";
import type { User } from "@/types/user";
import { FormErrorBoundary } from "@/components/form-error-boundary";
import { formatCurrency, type CurrencyCode } from "@/lib/utils/currency";
import { useQuery } from "@tanstack/react-query";
import { getProxyStatus } from "@/actions/proxy-status";
import type { ProxyStatusResponse } from "@/types/proxy-status";
import { copyToClipboard } from "@/lib/utils/clipboard";

const PROXY_STATUS_REFRESH_INTERVAL = 2000;

async function fetchProxyStatus(): Promise<ProxyStatusResponse> {
  const result = await getProxyStatus();
  if (result.ok) {
    if (result.data) {
      return result.data;
    }
    throw new Error("获取代理状态失败");
  }
  throw new Error(result.error || "获取代理状态失败");
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff <= 0) {
    return "刚刚";
  }

  const seconds = Math.floor(diff / 1000);
  if (seconds < 5) {
    return "刚刚";
  }
  if (seconds < 60) {
    return `${seconds}s前`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}分钟前`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}小时前`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}天前`;
  }

  return new Date(timestamp).toLocaleDateString("zh-CN");
}

function StatusSpinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 animate-spin rounded-full border border-muted-foreground/70 border-t-transparent"
    />
  );
}

interface KeyListHeaderProps {
  activeUser: UserDisplay | null;
  currentUser?: User;
  canManageActiveUser?: boolean;
  currencyCode?: CurrencyCode;
  showUserActions?: boolean;
  metricLabel?: string;
  providerGroupOptions?: string[];
  availableTags?: string[];
}

export function KeyListHeader({
  activeUser,
  currentUser,
  canManageActiveUser = false,
  currencyCode = "USD",
  showUserActions = true,
  metricLabel = "今日",
  providerGroupOptions = [],
  availableTags = [],
}: KeyListHeaderProps) {
  const [openAdd, setOpenAdd] = useState(false);
  const [keyResult, setKeyResult] = useState<{ generatedKey: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const totalRangeUsage =
    activeUser?.keys.reduce((sum, key) => sum + (key.todayUsage ?? 0), 0) ?? 0;

  const proxyStatusEnabled = Boolean(activeUser);
  const {
    data: proxyStatus,
    error: proxyStatusError,
    isLoading: proxyStatusLoading,
  } = useQuery<ProxyStatusResponse, Error>({
    queryKey: ["proxy-status"],
    queryFn: fetchProxyStatus,
    refetchInterval: PROXY_STATUS_REFRESH_INTERVAL,
    enabled: proxyStatusEnabled,
  });

  const activeUserStatus = useMemo(() => {
    if (!proxyStatus || !activeUser) {
      return null;
    }
    return proxyStatus.users.find((user) => user.userId === activeUser.id) ?? null;
  }, [proxyStatus, activeUser]);

  const proxyStatusContent = useMemo(() => {
    if (!proxyStatusEnabled) {
      return null;
    }

    if (proxyStatusLoading) {
      return (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>代理状态加载中</span>
          <StatusSpinner />
        </div>
      );
    }

    if (proxyStatusError) {
      return <div className="text-xs text-destructive">代理状态获取失败</div>;
    }

    if (!activeUserStatus) {
      return <div className="text-xs text-muted-foreground">暂无代理状态</div>;
    }

    const activeProviders = Array.from(
      new Set(activeUserStatus.activeRequests.map((request) => request.providerName))
    );

    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <span>活跃请求</span>
          <span className="font-medium text-foreground">{activeUserStatus.activeCount}</span>
          {activeProviders.length > 0 && (
            <span className="text-muted-foreground">（{activeProviders.join("、")}）</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span>最近请求</span>
          <span className="text-foreground">
            {activeUserStatus.lastRequest
              ? `${activeUserStatus.lastRequest.providerName} / ${activeUserStatus.lastRequest.model}`
              : "暂无记录"}
          </span>
          {activeUserStatus.lastRequest && (
            <span className="text-muted-foreground">
              · {formatRelativeTime(activeUserStatus.lastRequest.endTime)}
            </span>
          )}
        </div>
      </div>
    );
  }, [proxyStatusEnabled, proxyStatusLoading, proxyStatusError, activeUserStatus]);

  const handleKeyCreated = (result: { generatedKey: string; name: string }) => {
    setOpenAdd(false); // 关闭表单dialog
    setKeyResult(result); // 显示成功dialog
  };

  const handleCopy = async () => {
    if (!keyResult) return;
    try {
      await copyToClipboard(keyResult.generatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("复制失败:", err);
    }
  };

  const handleCloseSuccess = () => {
    setKeyResult(null);
    setCopied(false);
  };

  // 严格权限控制，只允许用户为自己创建 key
  const canAddKey = currentUser && activeUser && currentUser.id === activeUser.id;

  // 计算当前 Key 数量和最大限制
  const currentKeyCount = activeUser?.keys.length ?? 0;
  const maxKeysCount = activeUser?.maxKeysCount ?? 3; // ⭐ 从用户数据动态获取，默认 3
  const hasReachedLimit = currentKeyCount >= maxKeysCount;

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2 flex-1">
          <p className="text-sm font-semibold text-foreground">密钥运行概览（{metricLabel}）</p>
          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-border/50 bg-background px-2.5 py-1.5 shadow-sm">
              <p className="text-[10px]">{metricLabel}用量</p>
              <p className="text-sm font-semibold text-foreground">
                {activeUser ? formatCurrency(totalRangeUsage, currencyCode) : "-"}
              </p>
            </div>
            {activeUser && (
              <div className="rounded-md border border-border/50 bg-background px-2.5 py-1.5 shadow-sm">
                <p className="text-[10px]">启用 Key</p>
                <p className="text-sm font-semibold text-foreground">
                  {activeUser.keys.filter((key) => key.status === "enabled").length}/
                  {activeUser.keys.length}
                </p>
              </div>
            )}
            {activeUser && (
              <div className="rounded-md border border-orange-200/50 dark:border-orange-900/30 bg-gradient-to-br from-orange-50/50 to-orange-100/30 dark:from-orange-950/20 dark:to-orange-900/10 px-2.5 py-1.5 shadow-sm">
                <p className="text-[10px] text-orange-600 dark:text-orange-400">账户余额</p>
                <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                  ${(activeUser.balanceUsd ?? 0).toFixed(2)}
                </p>
              </div>
            )}
            {proxyStatusContent && (
              <div className="space-y-0.5 rounded-md border border-border/50 bg-background px-2.5 py-1.5 shadow-sm text-xs text-muted-foreground">
                <p className="text-[10px]">代理状态</p>
                <div className="text-[10px]">{proxyStatusContent}</div>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-6 lg:mt-8">
          {activeUser && showUserActions && (
            <div className="rounded-full bg-white/60 px-3 py-1 shadow-sm">
              <UserActions
                user={activeUser}
                currentUser={currentUser}
                providerGroupOptions={providerGroupOptions}
                availableTags={availableTags}
                showLabels
              />
            </div>
          )}
          {canAddKey && (
            <Dialog
              open={openAdd}
              onOpenChange={(open) => {
                // 当达到 Key 数量上限时，阻止打开对话框
                if (hasReachedLimit && open) {
                  return;
                }
                setOpenAdd(open);
              }}
            >
              <DialogTrigger asChild>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="rounded-md px-4 text-sm shadow-md"
                    disabled={!activeUser || hasReachedLimit}
                    title={
                      hasReachedLimit
                        ? `已达到 Key 数量上限（${currentKeyCount}/${maxKeysCount}）`
                        : `创建新的 Key（${currentKeyCount}/${maxKeysCount}）`
                    }
                  >
                    <ListPlus className="h-3.5 w-3.5" /> 新增 Key
                  </Button>
                  {currentUser?.role === "user" && (
                    <span className="text-xs text-muted-foreground">
                      {currentKeyCount}/{maxKeysCount}
                    </span>
                  )}
                </div>
              </DialogTrigger>
              <DialogContent className="max-w-2xl md:max-w-3xl xl:max-w-4xl max-h-[90vh] overflow-y-auto">
                <FormErrorBoundary>
                  <AddKeyForm
                    userId={activeUser?.id}
                    onSuccess={handleKeyCreated}
                    currentUserRole={currentUser?.role}
                  />
                </FormErrorBoundary>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Key创建成功弹窗 */}
      <Dialog open={!!keyResult} onOpenChange={(open) => !open && handleCloseSuccess()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Key 创建成功
            </DialogTitle>
            <DialogDescription>
              你的 API Key 已成功创建。请务必复制并妥善保存，此密钥仅显示一次。
            </DialogDescription>
          </DialogHeader>

          {keyResult && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">API Key</label>
                <div className="relative">
                  <div className="p-3 bg-muted/50 rounded-md font-mono text-sm break-all border-2 border-dashed border-orange-300 pr-12">
                    {keyResult.generatedKey}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="absolute top-1/2 right-2 -translate-y-1/2 h-7 w-7 p-0"
                  >
                    {copied ? (
                      <CheckCircle className="h-3 w-3 text-orange-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  请在关闭前复制并保存，关闭后将无法再次查看此密钥
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={handleCloseSuccess} variant="secondary">
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
