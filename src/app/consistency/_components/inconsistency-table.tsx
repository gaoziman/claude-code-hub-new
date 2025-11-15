"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { toast } from "sonner";
import { fixInconsistency } from "../_actions/fix";
import type { ConsistencyCheckItem, ConsistencyDimension } from "@/types/consistency";
import { cn } from "@/lib/utils";

interface InconsistencyTableProps {
  items: ConsistencyCheckItem[];
  onRefresh: () => void;
}

export function InconsistencyTable({ items, onRefresh }: InconsistencyTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [dimensionFilter, setDimensionFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"difference" | "rate">("difference");
  const [fixingItems, setFixingItems] = useState<Set<string>>(new Set());

  // 筛选和排序
  const filteredAndSortedItems = items
    .filter((item) => {
      // 搜索过滤
      if (searchQuery && !item.keyName.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      // 维度过滤
      if (dimensionFilter !== "all" && item.dimension !== dimensionFilter) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "difference") {
        return b.difference - a.difference;
      } else {
        return b.differenceRate - a.differenceRate;
      }
    });

  // 修复单项
  async function handleFixItem(item: ConsistencyCheckItem) {
    const itemKey = `${item.keyId}-${item.dimension}`;
    setFixingItems((prev) => new Set(prev).add(itemKey));

    try {
      const result = await fixInconsistency({
        keyId: item.keyId,
        dimension: item.dimension,
      });

      if (result.ok) {
        toast.success("修复成功", {
          description: `已修复 ${item.keyName} 的 ${getDimensionLabel(item.dimension)} 数据`,
        });
        // 重新检测
        onRefresh();
      } else {
        toast.error("修复失败", {
          description: result.error,
        });
      }
    } finally {
      setFixingItems((prev) => {
        const newSet = new Set(prev);
        newSet.delete(itemKey);
        return newSet;
      });
    }
  }

  // 获取维度标签
  function getDimensionLabel(dimension: ConsistencyDimension): string {
    const labels = {
      total: "总费用",
      daily: "每日费用",
      weekly: "周费用",
      monthly: "月费用",
      "5h": "5小时费用",
    };
    return labels[dimension] || dimension;
  }

  // 获取差异率颜色
  function getDifferenceRateColor(rate: number): string {
    if (rate < 5) return "text-green-600";
    if (rate < 20) return "text-yellow-600";
    return "text-red-600";
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/30 p-4">
        <Select value={dimensionFilter} onValueChange={setDimensionFilter}>
          <SelectTrigger className="w-[180px] rounded-xl border-muted-foreground/30">
            <SelectValue placeholder="筛选维度" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部维度</SelectItem>
            <SelectItem value="total">总费用</SelectItem>
            <SelectItem value="daily">每日费用</SelectItem>
            <SelectItem value="weekly">周费用</SelectItem>
            <SelectItem value="monthly">月费用</SelectItem>
            <SelectItem value="5h">5小时费用</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as "difference" | "rate")}>
          <SelectTrigger className="w-[180px] rounded-xl border-muted-foreground/30">
            <SelectValue placeholder="排序方式" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="difference">差异金额 ↓</SelectItem>
            <SelectItem value="rate">差异率 ↓</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="搜索 Key 名称..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm rounded-xl border-muted-foreground/30"
        />

        <div className="ml-auto text-xs uppercase tracking-[0.3em] text-muted-foreground">
          共 {filteredAndSortedItems.length} 条不一致记录
        </div>
      </div>

      <div className="overflow-hidden rounded-[32px] border border-border/60 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20">
              <TableHead>Key ID</TableHead>
              <TableHead>Key 名称</TableHead>
              <TableHead>维度</TableHead>
              <TableHead className="text-right">Redis</TableHead>
              <TableHead className="text-right">数据库</TableHead>
              <TableHead className="text-right">差异</TableHead>
              <TableHead className="text-right">差异率</TableHead>
              <TableHead className="text-center">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedItems.map((item) => {
              const itemKey = `${item.keyId}-${item.dimension}`;
              const isFixing = fixingItems.has(itemKey);

              return (
                <TableRow key={itemKey} className="border-b border-muted/30 hover:bg-muted/10">
                  <TableCell className="font-medium">
                    <span className="text-sm text-muted-foreground">#{item.keyId}</span>
                  </TableCell>
                  <TableCell className="max-w-[220px]">
                    <div className="font-medium">{item.keyName}</div>
                    <p className="text-sm text-muted-foreground">ID: {item.keyId}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="rounded-full">
                      {getDimensionLabel(item.dimension)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {item.redisValue !== null ? `$${item.redisValue.toFixed(4)}` : "-"}
                  </TableCell>
                  <TableCell className="text-right">${item.databaseValue.toFixed(4)}</TableCell>
                  <TableCell className="text-right font-medium">
                    ${item.difference.toFixed(4)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium",
                      getDifferenceRateColor(item.differenceRate)
                    )}
                  >
                    {item.differenceRate.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleFixItem(item)}
                      disabled={isFixing}
                      className="rounded-full"
                    >
                      {isFixing ? "修复中..." : "修复"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
