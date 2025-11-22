"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  ExternalLink,
  Loader2,
  FileWarning,
  MessageSquare,
  Smartphone,
  Info,
} from "lucide-react";
import type { ProviderChainItem } from "@/types/message";
import { hasSessionMessages } from "@/actions/active-sessions";
import { formatProviderTimeline } from "@/lib/utils/provider-chain-formatter";

interface ErrorDetailsDialogProps {
  statusCode: number | null;
  errorMessage: string | null;
  providerChain: ProviderChainItem[] | null;
  sessionId: string | null;
  blockedBy?: string | null; // 拦截类型
  blockedReason?: string | null; // 拦截原因（JSON 字符串）
  originalModel?: string | null; // 原始模型（重定向前）
  currentModel?: string | null; // 当前模型（重定向后）
  userAgent?: string | null; // User-Agent
  messagesCount?: number | null; // Messages 数量
}

const blockedByLabels: Record<string, string> = {
  sensitive_word: '敏感词拦截',
};

export function ErrorDetailsDialog({
  statusCode,
  errorMessage,
  providerChain,
  sessionId,
  blockedBy,
  blockedReason,
  originalModel,
  currentModel,
  userAgent,
  messagesCount,
}: ErrorDetailsDialogProps) {
  const [open, setOpen] = useState(false);
  const [hasMessages, setHasMessages] = useState(false);
  const [checkingMessages, setCheckingMessages] = useState(false);

  const isSuccess = statusCode && statusCode >= 200 && statusCode < 300;
  const isError = statusCode && (statusCode >= 400 || statusCode < 200);
  const isInProgress = !statusCode; // 没有状态码表示请求进行中
  const isBlocked = !!blockedBy; // 是否被拦截

  // 解析 blockedReason JSON
  let parsedBlockedReason: { word?: string; matchType?: string; matchedText?: string } | null = null;
  if (blockedReason) {
    try {
      parsedBlockedReason = JSON.parse(blockedReason);
    } catch {
      // 解析失败，忽略
    }
  }

  // 检查 session 是否有 messages 数据
  useEffect(() => {
    if (open && sessionId) {
      setCheckingMessages(true);
      hasSessionMessages(sessionId)
        .then((result) => {
          if (result.ok) {
            setHasMessages(result.data);
          }
        })
        .catch((err) => {
          console.error('Failed to check session messages:', err);
        })
        .finally(() => {
          setCheckingMessages(false);
        });
    } else {
      // 弹窗关闭时重置状态
      setHasMessages(false);
      setCheckingMessages(false);
    }
  }, [open, sessionId]);

  const formatErrorMessage = (message: string | null) => {
    if (!message) return null;
    try {
      const parsed = JSON.parse(message);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return message;
    }
  };

  const getStatusBadgeVariant = () => {
    if (isInProgress) return "outline"; // 请求中使用 outline 样式
    if (isSuccess) return "default";
    if (isError) return "destructive";
    return "secondary";
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto p-0 font-normal hover:bg-transparent"
        >
          <Badge variant={getStatusBadgeVariant()} className="cursor-pointer">
            {isInProgress ? "请求中" : statusCode}
          </Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isInProgress ? (
              <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
            ) : isSuccess ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-destructive" />
            )}
            请求详情 - 状态码 {isInProgress ? "请求中" : statusCode || "未知"}
          </DialogTitle>
          <DialogDescription>
            {isInProgress
              ? "请求正在进行中，尚未完成"
              : isSuccess
              ? "请求成功完成"
              : "请求失败，以下是详细的错误信息和供应商决策链"}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <InfoCard
              icon={<Info className="h-4 w-4 text-blue-500" />}
              title="会话 ID"
              description="用于追踪完整请求链路"
              action={
                hasMessages && !checkingMessages && sessionId ? (
                  <Link href={`/dashboard/sessions/${sessionId}/messages`}>
                    <Button variant="outline" size="sm">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      查看消息
                    </Button>
                  </Link>
                ) : null
              }
            >
              <code className="block overflow-hidden text-ellipsis whitespace-pre-wrap break-all text-xs font-mono">
                {sessionId ?? "-"}
              </code>
            </InfoCard>

            <InfoCard
              icon={<MessageSquare className="h-4 w-4 text-purple-500" />}
              title="消息数量"
              description="该 Session 累计消息条数"
            >
              <span className="text-base font-semibold">
                {messagesCount !== null && messagesCount !== undefined ? messagesCount : "-"}
              </span>
            </InfoCard>

            {userAgent && (
              <InfoCard
                icon={<Smartphone className="h-4 w-4 text-emerald-500" />}
                title="客户端信息"
                description="请求来源及版本"
              >
                <code className="block overflow-hidden text-ellipsis whitespace-pre-wrap break-all text-xs font-mono">
                  {userAgent}
                </code>
              </InfoCard>
            )}

            {originalModel && currentModel && originalModel !== currentModel && (
              <InfoCard
                icon={<ArrowRight className="h-4 w-4 text-amber-500" />}
                title="模型重定向"
                description="请求与实际调用模型"
              >
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">请求</span>
                    <Badge variant="outline">{originalModel}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">实际</span>
                    <Badge variant="secondary">{currentModel}</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    计费优先使用请求模型价格，若无则使用实际模型价格。
                  </p>
                </div>
              </InfoCard>
            )}

            {isBlocked && blockedBy && (
              <InfoCard
                icon={<AlertCircle className="h-4 w-4 text-orange-500" />}
                title="拦截信息"
                description="命中敏感词或策略"
              >
                <Badge variant="outline" className="border-orange-500 text-orange-600">
                  {blockedByLabels[blockedBy] || blockedBy}
                </Badge>
                {parsedBlockedReason && (
                  <div className="mt-3 space-y-2 text-xs text-orange-800">
                    {parsedBlockedReason.word && (
                      <div className="flex items-center gap-2">
                        <span>敏感词</span>
                        <code className="rounded bg-orange-100 px-2 py-0.5">
                          {parsedBlockedReason.word}
                        </code>
                      </div>
                    )}
                    {parsedBlockedReason.matchType && (
                      <div>
                        匹配类型：{parsedBlockedReason.matchType}
                      </div>
                    )}
                    {parsedBlockedReason.matchedText && (
                      <div>
                        <div className="mb-1">匹配内容：</div>
                        <pre className="rounded bg-orange-50 px-2 py-1 text-[11px]">
                          {parsedBlockedReason.matchedText}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </InfoCard>
            )}
          </div>

          {/* 拦截信息 */}
          {/* 最终错误信息 */}
          {errorMessage && (
            <InfoCard
              icon={<FileWarning className="h-4 w-4 text-red-500" />}
              title="错误信息"
              description="供应商返回的原始错误"
            >
              <div className="rounded-lg border bg-destructive/5 p-0 font-mono text-xs text-destructive">
                <pre className="whitespace-pre-wrap break-words p-3">
                  {formatErrorMessage(errorMessage)}
                </pre>
              </div>
            </InfoCard>
          )}

          {/* 供应商决策链时间线 */}
          {providerChain && providerChain.length > 0 && (
            <TimelineCard providerChain={providerChain} />
          )}

          {/* 无错误信息的情况 */}
          {!errorMessage && (!providerChain || providerChain.length === 0) && (
            <div className="text-center py-8 text-muted-foreground">
              {isInProgress
                ? "请求正在处理中，等待响应..."
                : isSuccess
                ? "请求成功，无错误信息"
                : "暂无详细错误信息"}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoCard({
  title,
  description,
  icon,
  children,
  action,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between rounded-lg border bg-muted/30 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            {icon}
            <span>{title}</span>
          </div>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-3 text-sm text-foreground">{children}</div>
    </div>
  );
}

function TimelineCard({ providerChain }: { providerChain: ProviderChainItem[] }) {
  const { timeline, totalDuration } = formatProviderTimeline(providerChain);

  const segments = useMemo(() => {
    const startTag = "[[[CODE_START]]]";
    const endTag = "[[[CODE_END]]]";
    const parts: { type: "text" | "code"; content: string }[] = [];

    let remaining = timeline;
    while (remaining.length > 0) {
      const startIndex = remaining.indexOf(startTag);
      if (startIndex === -1) {
        if (remaining.trim()) {
          parts.push({ type: "text", content: remaining });
        }
        break;
      }

      if (startIndex > 0) {
        parts.push({ type: "text", content: remaining.slice(0, startIndex) });
      }

      const afterStart = remaining.slice(startIndex + startTag.length);
      const endIndex = afterStart.indexOf(endTag);
      if (endIndex === -1) {
        parts.push({ type: "code", content: afterStart.trim() });
        break;
      }

      const codeContent = afterStart.slice(0, endIndex);
      parts.push({ type: "code", content: codeContent.trim() });
      remaining = afterStart.slice(endIndex + endTag.length);
    }

    return parts;
  }, [timeline]);

  return (
    <div className="space-y-3 rounded-lg border bg-background/80 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ArrowRight className="h-4 w-4 text-primary" />
          供应商决策链时间线
        </div>
        {totalDuration > 0 && (
          <span className="text-xs text-muted-foreground">总耗时：{totalDuration}ms</span>
        )}
      </div>
      <div className="rounded-lg bg-muted/20 text-xs leading-relaxed">
        <div className="max-h-[420px] overflow-auto space-y-3 p-4">
          {segments.map((segment, idx) =>
            segment.type === "code" ? (
              <pre
                key={`code-${idx}`}
                className="whitespace-pre-wrap break-words rounded-md border border-muted-foreground/20 bg-background p-3 font-mono text-xs"
              >
                {segment.content}
              </pre>
            ) : (
              <pre
                key={`text-${idx}`}
                className="whitespace-pre-wrap break-words font-mono text-xs"
              >
                {segment.content}
              </pre>
            )
          )}
        </div>
      </div>
    </div>
  );
}
