"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import type { UsageLogRow } from "@/repository/usage-logs";
import { ProviderChainPopover } from "./provider-chain-popover";
import { ErrorDetailsDialog } from "./error-details-dialog";
import { formatProviderSummary } from "@/lib/utils/provider-chain-formatter";
import { ModelDisplayWithRedirect } from "./model-display-with-redirect";
import type { CurrencyCode } from "@/lib/utils/currency";
import { formatCurrency } from "@/lib/utils/currency";
import { formatTokenAmount } from "@/lib/utils";
import { DataPagination } from "@/components/data-pagination";
import { Badge } from "@/components/ui/badge";

/**
 * 格式化请求耗时
 * - 1000ms 以上显示为秒（如 "1.23s"）
 * - 1000ms 以下显示为毫秒（如 "850ms"）
 */
function formatDuration(durationMs: number | null): string {
  if (!durationMs) return '-';

  // 1000ms 以上转换为秒
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(2)}s`;
  }

  // 1000ms 以下显示毫秒
  return `${durationMs}ms`;
}

/**
 * 格式化时间为 "YYYY-MM-DD HH:mm:ss" 格式
 */
function formatDateTime(date: Date | string | null): string {
  if (!date) return '-';

  const d = typeof date === 'string' ? new Date(date) : date;

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

interface UsageLogsTableProps {
  isAdmin: boolean;
  logs: UsageLogRow[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  isPending: boolean;
  newLogIds?: Set<number>; // 新增记录 ID 集合（用于动画高亮）
  currencyCode?: CurrencyCode;
}

export function UsageLogsTable({
  isAdmin,
  logs,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions,
  isPending,
  newLogIds,
  currencyCode = "USD",
}: UsageLogsTableProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>用户</TableHead>
              <TableHead>密钥</TableHead>
              {/* ⭐ 供应商列仅管理员可见 */}
              {isAdmin && <TableHead>供应商</TableHead>}
              <TableHead>模型</TableHead>
              <TableHead className="text-right">输入</TableHead>
              <TableHead className="text-right">输出</TableHead>
              <TableHead className="text-right">缓存读取</TableHead>
              <TableHead className="text-right">缓存写入</TableHead>
              <TableHead className="text-right">成本</TableHead>
              <TableHead className="text-right">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-end gap-1 cursor-help">
                        剩余额度
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">
                        请求完成后的剩余可用额度
                        <br />
                        （套餐剩余 + 账户余额）
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="text-right">耗时</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 13 : 12} className="text-center text-muted-foreground">
                  暂无数据
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow
                  key={log.id}
                  className={newLogIds?.has(log.id) ? 'animate-highlight-flash' : ''}
                >
                  <TableCell className="font-mono text-xs">
                    {formatDateTime(log.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.userName}</TableCell>
                  <TableCell className="font-mono text-xs">{log.keyName}</TableCell>
                  {/* ⭐ 供应商列仅管理员可见 */}
                  {isAdmin && (
                    <TableCell className="text-left">
                      {log.blockedBy ? (
                        // 被拦截的请求显示拦截标记
                        <span className="inline-flex items-center gap-1 rounded-md bg-orange-100 dark:bg-orange-950 px-2 py-1 text-xs font-medium text-orange-700 dark:text-orange-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-orange-600 dark:bg-orange-400" />
                          被拦截
                        </span>
                      ) : (
                        <div className="flex items-start gap-2">
                          <div className="flex flex-col items-start gap-0.5 min-w-0 flex-1">
                            {log.providerChain && log.providerChain.length > 0 ? (
                              <>
                                <div className="w-full">
                                  <ProviderChainPopover
                                    chain={log.providerChain}
                                    finalProvider={
                                      log.providerChain[log.providerChain.length - 1].name || log.providerName || "未知"
                                    }
                                  />
                                </div>
                                {/* 摘要文字（第二行显示，左对齐） */}
                                {formatProviderSummary(log.providerChain) && (
                                  <div className="w-full">
                                    <TooltipProvider>
                                      <Tooltip delayDuration={300}>
                                        <TooltipTrigger asChild>
                                          <span className="text-xs text-muted-foreground cursor-help truncate max-w-[200px] block text-left">
                                            {formatProviderSummary(log.providerChain)}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" align="start" className="max-w-[500px]">
                                          <p className="text-xs whitespace-normal break-words font-mono">
                                            {formatProviderSummary(log.providerChain)}
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                )}
                              </>
                            ) : (
                              <span>{log.providerName || "-"}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="font-mono text-xs">
                    <ModelDisplayWithRedirect
                      originalModel={log.originalModel}
                      currentModel={log.model}
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatTokenAmount(log.inputTokens)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatTokenAmount(log.outputTokens)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatTokenAmount(log.cacheReadInputTokens)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatTokenAmount(log.cacheCreationInputTokens)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {log.costUsd ? formatCurrency(log.costUsd, currencyCode, 6) : "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {log.remainingQuotaUsd !== null && log.remainingQuotaUsd !== undefined ? (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">
                        {formatCurrency(log.remainingQuotaUsd, currencyCode, 4)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatDuration(log.durationMs)}
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <ErrorDetailsDialog
                        statusCode={log.statusCode}
                        errorMessage={log.errorMessage}
                        providerChain={log.providerChain}
                        sessionId={log.sessionId}
                        blockedBy={log.blockedBy}
                        blockedReason={log.blockedReason}
                        originalModel={log.originalModel}
                        currentModel={log.model}
                        userAgent={log.userAgent}
                        messagesCount={log.messagesCount}
                      />
                    ) : (
                      <Badge
                        variant={
                          !log.statusCode
                            ? "outline"
                            : log.statusCode >= 200 && log.statusCode < 300
                            ? "default"
                            : "destructive"
                        }
                        className="cursor-default select-none"
                      >
                        {log.statusCode ?? "请求中"}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <DataPagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          pageSizeOptions={pageSizeOptions}
          isDisabled={isPending}
        />
      )}
    </div>
  );
}
