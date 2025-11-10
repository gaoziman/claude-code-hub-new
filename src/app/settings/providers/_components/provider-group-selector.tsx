"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProviderGroupSummary } from "@/types/provider";
import { ProviderGroupManagerDialog } from "./provider-group-manager-dialog";

interface ProviderGroupSelectorProps {
  value: string;
  onChange: (value: string) => void;
  groups: ProviderGroupSummary[];
  disabled?: boolean;
  canManageGroups?: boolean;
  onGroupsUpdated?: () => void;
}

export function ProviderGroupSelector({
  value,
  onChange,
  groups,
  disabled,
  canManageGroups = false,
  onGroupsUpdated,
}: ProviderGroupSelectorProps) {
  const [localGroups, setLocalGroups] = useState(groups);

  useEffect(() => {
    setLocalGroups(groups);
  }, [groups]);

  return (
    <div className="space-y-3">
      {localGroups.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {localGroups.map((group) => {
            const isActive = value === group.name;
            return (
              <Button
                key={group.name}
                type="button"
                variant={isActive ? "secondary" : "outline"}
                size="sm"
                disabled={disabled}
                className="rounded-full"
                onClick={() => onChange(group.name)}
              >
                {group.name}
                <span className="ml-1 text-xs text-muted-foreground">({group.count})</span>
              </Button>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">暂无分组，输入名称即可创建新分组。</p>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="例如: premium, economy"
          disabled={disabled}
        />
        {canManageGroups ? (
          <ProviderGroupManagerDialog
            trigger={
              <Button type="button" variant="outline" size="sm" disabled={disabled}>
                管理分组
              </Button>
            }
            groups={localGroups}
            onGroupsUpdated={onGroupsUpdated}
            onLocalRename={(oldName, newName) => {
              setLocalGroups((prev) =>
                prev
                  .map((group) => (group.name === oldName ? { ...group, name: newName } : group))
                  .sort((a, b) => b.count - a.count)
              );
              if (value === oldName) {
                onChange(newName);
              }
            }}
            onLocalDelete={(name) => {
              setLocalGroups((prev) => prev.filter((group) => group.name !== name));
              if (value === name) {
                onChange("");
              }
            }}
          />
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        点击标签快速选择，或输入新名称创建分组。留空表示不限制用户分组。
      </p>
    </div>
  );
}
