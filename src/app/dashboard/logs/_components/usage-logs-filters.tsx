"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, RotateCcw } from "lucide-react";
import { getModelList, getStatusCodeList } from "@/actions/usage-logs";
import { getKeys } from "@/actions/keys";
import type { UserDisplay } from "@/types/user";
import type { ProviderDisplay } from "@/types/provider";
import type { Key } from "@/types/key";

/**
 * 将 Date 对象格式化为 date 输入所需的格式 (YYYY-MM-DD)
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 解析 date 输入的值为本地时间的 Date 对象
 * 避免 new Date("2025-11-06") 被解析为 UTC 时间导致的时区问题
 */
function parseDate(value: string): Date {
  // date 输入格式: "2025-11-06"
  const [year, month, day] = value.split('-').map(Number);
  // 创建本地时间的日期对象（注意：月份是从 0 开始的）
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * 获取今天的日期（YYYY-MM-DD 格式）
 */
function getTodayDateString(): string {
  return formatDate(new Date());
}

interface UsageLogsFiltersProps {
  isAdmin: boolean;
  isChildKeyView: boolean;
  users: UserDisplay[];
  providers: ProviderDisplay[];
  initialKeys: Key[];
  filters: {
    userId?: number;
    keyId?: number;
    providerId?: number;
    date?: Date; // 单个日期，查询当天的记录
    statusCode?: number;
    model?: string;
    pageSize?: number;
  };
  onChange: (filters: UsageLogsFiltersProps["filters"]) => void;
  onReset: () => void;
}

export function UsageLogsFilters({
  isAdmin,
  isChildKeyView,
  users,
  providers,
  initialKeys,
  filters,
  onChange,
  onReset,
}: UsageLogsFiltersProps) {
  const [models, setModels] = useState<string[]>([]);
  const [statusCodes, setStatusCodes] = useState<number[]>([]);
  const [keys, setKeys] = useState<Key[]>(initialKeys);
  const [localFilters, setLocalFilters] = useState(filters);

  // 加载筛选器选项
  useEffect(() => {
    const loadOptions = async () => {
      const [modelsResult, codesResult] = await Promise.all([
        getModelList(),
        getStatusCodeList(),
      ]);

      if (modelsResult.ok && modelsResult.data) {
        setModels(modelsResult.data);
      }

      if (codesResult.ok && codesResult.data) {
        setStatusCodes(codesResult.data);
      }

      // 管理员：如果选择了用户，加载该用户的 keys
      // 非管理员：已经有 initialKeys，不需要额外加载
      if (isAdmin && localFilters.userId) {
        const keysResult = await getKeys(localFilters.userId);
        if (keysResult.ok && keysResult.data) {
          setKeys(keysResult.data);
        }
      }
    };

    loadOptions();
  }, [isAdmin, localFilters.userId]);

  // 处理用户选择变更
  const handleUserChange = async (userId: string) => {
    const newUserId = userId ? parseInt(userId) : undefined;
    const newFilters = { ...localFilters, userId: newUserId, keyId: undefined };
    setLocalFilters(newFilters);

    // 加载该用户的 keys
    if (newUserId) {
      const keysResult = await getKeys(newUserId);
      if (keysResult.ok && keysResult.data) {
        setKeys(keysResult.data);
      }
    } else {
      setKeys([]);
    }
  };

  const handleApply = () => {
    onChange(localFilters);
  };

  const handleReset = () => {
    setLocalFilters({});
    setKeys([]);
    onReset();
  };

  const showKeySelect = isAdmin || !isChildKeyView;

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        {/* 日期选择 */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">日期</Label>
          <Input
            type="date"
            className="h-9 w-36 rounded-lg text-sm"
            value={localFilters.date ? formatDate(localFilters.date) : getTodayDateString()}
            onChange={(e) =>
              setLocalFilters({
                ...localFilters,
                date: e.target.value ? parseDate(e.target.value) : undefined,
              })
            }
          />
        </div>

        {/* 用户选择（仅 Admin） */}
        {isAdmin && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">用户</Label>
            <Select
              value={localFilters.userId?.toString() || ""}
              onValueChange={handleUserChange}
            >
              <SelectTrigger className="h-9 w-40 rounded-lg">
                <SelectValue placeholder="全部用户" />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id.toString()}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Key 选择（子 Key 视图不展示） */}
        {showKeySelect && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">API 密钥</Label>
            <Select
              value={localFilters.keyId?.toString() || ""}
              onValueChange={(value: string) =>
                setLocalFilters({
                  ...localFilters,
                  keyId: value ? parseInt(value) : undefined,
                })
              }
              disabled={isAdmin && !localFilters.userId && keys.length === 0}
            >
              <SelectTrigger className="h-9 w-44 rounded-lg">
                <SelectValue
                  placeholder={
                    isAdmin && !localFilters.userId && keys.length === 0 ? "请先选择用户" : "全部密钥"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {keys.map((key) => (
                  <SelectItem key={key.id} value={key.id.toString()}>
                    {key.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 供应商选择 */}
        {isAdmin && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">供应商</Label>
            <Select
              value={localFilters.providerId?.toString() || ""}
              onValueChange={(value: string) =>
                setLocalFilters({
                  ...localFilters,
                  providerId: value ? parseInt(value) : undefined,
                })
              }
            >
              <SelectTrigger className="h-9 w-44 rounded-lg">
                <SelectValue placeholder="全部供应商" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id.toString()}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 模型选择 */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">模型</Label>
          <Select
            value={localFilters.model || ""}
            onValueChange={(value: string) =>
              setLocalFilters({ ...localFilters, model: value || undefined })
            }
          >
            <SelectTrigger className="h-9 w-48 rounded-lg">
              <SelectValue placeholder="全部模型" />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 状态码选择 */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">状态码</Label>
          <Select
            value={localFilters.statusCode?.toString() || ""}
            onValueChange={(value: string) =>
              setLocalFilters({
                ...localFilters,
                statusCode: value ? parseInt(value) : undefined,
              })
            }
          >
            <SelectTrigger className="h-9 w-36 rounded-lg">
              <SelectValue placeholder="全部状态码" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="200">200 (成功)</SelectItem>
              <SelectItem value="400">400 (错误请求)</SelectItem>
              <SelectItem value="401">401 (未授权)</SelectItem>
              <SelectItem value="429">429 (限流)</SelectItem>
              <SelectItem value="500">500 (服务器错误)</SelectItem>
              {statusCodes
                .filter((code) => ![200, 400, 401, 429, 500].includes(code))
                .map((code) => (
                  <SelectItem key={code} value={code.toString()}>
                    {code}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          <Button
            onClick={handleApply}
            size="sm"
            className="h-9 gap-1.5 rounded-lg px-4"
          >
            <Filter className="h-3.5 w-3.5" />
            <span className="text-sm">应用筛选</span>
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            size="sm"
            className="h-9 gap-1.5 rounded-lg px-4"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="text-sm">重置</span>
          </Button>
        </div>
      </div>
  );
}
