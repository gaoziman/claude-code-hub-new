"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DataPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  isDisabled?: boolean;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export function DataPagination({
  page,
  pageSize,
  total,
  isDisabled = false,
  pageSizeOptions = [20, 50, 100, 200],
  onPageChange,
  onPageSizeChange,
}: DataPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const [pageInput, setPageInput] = useState(page.toString());

  useEffect(() => {
    setPageInput(page.toString());
  }, [page]);

  const clampPage = (value: number) => {
    if (Number.isNaN(value) || value < 1) return 1;
    if (value > totalPages) return totalPages;
    return value;
  };

  const pageItems = useMemo(() => {
    const items: Array<number | "ellipsis"> = [];

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        items.push(i);
      }
      return items;
    }

    const addRange = (start: number, end: number) => {
      for (let i = start; i <= end; i++) {
        items.push(i);
      }
    };

    const showLeftEllipsis = page > 4;
    const showRightEllipsis = page < totalPages - 3;

    addRange(1, showLeftEllipsis ? 2 : 3);

    if (showLeftEllipsis) {
      items.push("ellipsis");
      const start = Math.max(3, page - 1);
      const end = Math.min(totalPages - 2, page + 1);
      addRange(start, end);
    } else {
      addRange(3, Math.min(5, totalPages - 2));
    }

    if (showRightEllipsis) {
      items.push("ellipsis");
      addRange(totalPages - 1, totalPages);
    } else {
      addRange(Math.max(totalPages - 2, 4), totalPages);
    }

    return Array.from(new Set(items)).filter((item, idx, arr) => {
      if (item === "ellipsis") {
        return !(idx > 0 && arr[idx - 1] === "ellipsis");
      }
      return true;
    });
  }, [page, totalPages]);

  const handleJump = () => {
    const parsed = parseInt(pageInput, 10);
    if (Number.isNaN(parsed)) return;
    const target = clampPage(parsed);
    if (target !== page) {
      onPageChange(target);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      handleJump();
    }
  };

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <p className="text-sm text-muted-foreground">
        共 {total.toLocaleString()} 条 · 第 {page} / {totalPages} 页
      </p>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">每页</Label>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => onPageSizeChange(Number(value))}
              disabled={isDisabled}
            >
              <SelectTrigger className="w-[90px] rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size} 条
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-1 rounded-2xl border border-border/60 bg-card px-2 py-1 shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1 || isDisabled}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1">
            {pageItems.map((item, index) =>
              item === "ellipsis" ? (
                <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => onPageChange(item)}
                  className={cn(
                    "h-8 w-8 rounded-full text-sm transition-colors",
                    item === page
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {item}
                </button>
              )
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages || isDisabled}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">跳至</span>
          <Input
            type="number"
            min={1}
            max={totalPages}
            value={pageInput}
            onChange={(event) => setPageInput(event.target.value)}
            onKeyDown={handleKeyDown}
            className="h-9 w-20 rounded-xl"
            disabled={isDisabled}
          />
          <span className="text-muted-foreground">页</span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleJump}
            disabled={isDisabled}
          >
            跳转
          </Button>
        </div>
      </div>
    </div>
  );
}
