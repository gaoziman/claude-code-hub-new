"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

interface ProviderGroupSelectProps {
  value?: string;
  onChange: (value: string) => void;
  options?: string[];
  placeholder?: string;
  disabled?: boolean;
}

function parseValue(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function ProviderGroupSelect({
  value,
  onChange,
  options = [],
  placeholder = "选择供应商分组（可选）",
  disabled = false,
}: ProviderGroupSelectProps) {
  const [open, setOpen] = useState(false);
  const [customGroup, setCustomGroup] = useState("");

  const selectedGroups = useMemo(() => parseValue(value), [value]);
  const normalizedOptions = useMemo(() => {
    const set = new Set<string>();
    options.forEach((option) => {
      const normalized = option.trim();
      if (normalized) {
        set.add(normalized);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-CN", { sensitivity: "base" }));
  }, [options]);

  const updateValue = (next: string[]) => {
    onChange(next.join(","));
  };

  const toggleGroup = (group: string) => {
    const normalized = group.trim();
    if (!normalized) return;

    if (selectedGroups.includes(normalized)) {
      updateValue(selectedGroups.filter((item) => item !== normalized));
      return;
    }
    updateValue([...selectedGroups, normalized]);
  };

  const handleAddCustom = () => {
    const normalized = customGroup.trim();
    if (!normalized) return;
    if (selectedGroups.includes(normalized)) {
      setCustomGroup("");
      return;
    }
    updateValue([...selectedGroups, normalized]);
    setCustomGroup("");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddCustom();
    }
  };

  const buttonLabel =
    selectedGroups.length > 0 ? (
      <span className="truncate">
        {selectedGroups.length > 2
          ? `已选择 ${selectedGroups.length} 个分组`
          : selectedGroups.join(", ")}
      </span>
    ) : (
      <span className="text-muted-foreground">{placeholder}</span>
    );

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between"
          >
            {buttonLabel}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start" side="bottom">
          <Command shouldFilter={normalizedOptions.length > 6}>
            {normalizedOptions.length > 0 && (
              <CommandInput placeholder="搜索供应商分组..." />
            )}
            <CommandList className="max-h-56">
              <CommandEmpty>
                {normalizedOptions.length === 0 ? "暂无供应商配置分组，可手动添加" : "没有匹配的分组"}
              </CommandEmpty>
              {normalizedOptions.length > 0 && (
                <CommandGroup heading="供应商分组">
                  {normalizedOptions.map((option) => {
                    const isActive = selectedGroups.includes(option);
                    return (
                      <CommandItem
                        key={option}
                        value={option}
                        onSelect={() => toggleGroup(option)}
                        className="cursor-pointer"
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            isActive ? "opacity-100 text-primary" : "opacity-0"
                          )}
                        />
                        <span className="flex-1 truncate">{option}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>

          <div className="border-t p-3 space-y-2">
            <p className="text-xs text-muted-foreground">新建或粘贴自定义分组标签</p>
            <div className="flex gap-2">
              <Input
                placeholder="输入分组标签"
                value={customGroup}
                onChange={(event) => setCustomGroup(event.target.value)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                maxLength={50}
              />
              <Button
                size="sm"
                type="button"
                onClick={handleAddCustom}
                disabled={disabled || !customGroup.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* 隐藏下方标签展示，避免重复显示 */}
    </div>
  );
}
