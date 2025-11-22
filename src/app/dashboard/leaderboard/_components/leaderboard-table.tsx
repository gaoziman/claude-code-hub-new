"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { LeaderboardEntry } from "@/repository/leaderboard";
import type { CurrencyCode } from "@/lib/utils/currency";
import { formatCurrency } from "@/lib/utils/currency";
import { formatTokenAmount } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type LeaderboardMetric = "cost" | "requests" | "tokens";

interface LeaderboardTableProps {
  data: LeaderboardEntry[];
  metric: LeaderboardMetric;
  currencyCode: CurrencyCode;
  comparisonRanks?: Map<number, number>;
  viewerId?: number | null;
}

const metricColumnLabel: Record<LeaderboardMetric, string> = {
  cost: "本期消耗",
  requests: "本期请求",
  tokens: "本期 Token",
};

export function LeaderboardTable({
  data,
  metric,
  currencyCode,
  comparisonRanks,
  viewerId,
}: LeaderboardTableProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          暂无可展示的排行数据
        </CardContent>
      </Card>
    );
  }

  const metricValue = (entry: LeaderboardEntry) => {
    if (metric === "cost") return formatCurrency(entry.totalCost, currencyCode);
    if (metric === "requests") return `${entry.totalRequests.toLocaleString()} 次`;
    return formatTokenAmount(entry.totalTokens);
  };

  const renderRankChange = (userId: number, rank: number) => {
    if (!comparisonRanks?.has(userId)) {
      return (
        <Badge variant="secondary" className="text-xs">
          新上榜
        </Badge>
      );
    }

    const previousRank = comparisonRanks.get(userId)!;
    const diff = previousRank - rank;
    if (diff === 0) {
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Minus className="h-3.5 w-3.5" />
          持平
        </span>
      );
    }

    const improved = diff > 0;
    return (
      <span
        className={cn(
          "flex items-center gap-1 text-xs font-semibold",
          improved ? "text-emerald-600" : "text-destructive"
        )}
      >
        {improved ? (
          <ArrowUpRight className="h-3.5 w-3.5" />
        ) : (
          <ArrowDownRight className="h-3.5 w-3.5" />
        )}
        {Math.abs(diff)} 名
      </span>
    );
  };

  return (
    <Card className="border-none shadow-none">
      <CardContent className="p-0">
        <div className="rounded-lg border border-border/60 bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">排名</TableHead>
                <TableHead>用户</TableHead>
                <TableHead className="text-right">请求次数</TableHead>
                <TableHead className="text-right">Token 数</TableHead>
                <TableHead className="text-right">消耗金额</TableHead>
                <TableHead className="text-right">{metricColumnLabel[metric]}</TableHead>
                <TableHead className="text-right">排名变化</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((entry, index) => {
                const rank = index + 1;
                const isViewer = viewerId != null && entry.userId === viewerId;
                const isTopThree = rank <= 3;

                return (
                  <TableRow
                    key={`${entry.userId}-${rank}`}
                    className={cn(
                      isTopThree ? "bg-muted/40" : undefined,
                      isViewer ? "ring-1 ring-primary/40" : undefined
                    )}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={isTopThree ? "default" : "outline"}
                          className="rounded-full px-2"
                        >
                          #{rank}
                        </Badge>
                        {isViewer && <Badge variant="secondary">我</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className={cn(isTopThree && "font-semibold")}>
                      {entry.userName}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {entry.totalRequests.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatTokenAmount(entry.totalTokens)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(entry.totalCost, currencyCode)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm">
                      {metricValue(entry)}
                    </TableCell>
                    <TableCell className="text-right">
                      {renderRankChange(entry.userId, rank)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
