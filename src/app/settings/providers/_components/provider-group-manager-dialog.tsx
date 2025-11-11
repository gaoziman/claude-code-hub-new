"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { ProviderGroupSummary } from "@/types/provider";
import { deleteProviderGroupAction, renameProviderGroupAction } from "@/actions/providers";
import { Loader2, Pencil, Trash2 } from "lucide-react";

interface ProviderGroupManagerDialogProps {
  trigger: React.ReactNode;
  groups: ProviderGroupSummary[];
  onGroupsUpdated?: () => void;
  onLocalRename?: (oldName: string, newName: string) => void;
  onLocalDelete?: (name: string) => void;
}

export function ProviderGroupManagerDialog({
  trigger,
  groups,
  onGroupsUpdated,
  onLocalRename,
  onLocalDelete,
}: ProviderGroupManagerDialogProps) {
  const [open, setOpen] = useState(false);
  const [localGroups, setLocalGroups] = useState(groups);
  const [editing, setEditing] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    setLocalGroups(groups);
  }, [groups]);

  const handleRename = (oldName: string) => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      toast.error("分组名称不能为空");
      return;
    }
    startTransition(async () => {
      const res = await renameProviderGroupAction(oldName, trimmed);
      if (!res.ok) {
        toast.error(res.error || "重命名失败");
        return;
      }
      setLocalGroups((prev) =>
        prev
          .map((group) =>
            group.name === oldName
              ? {
                  ...group,
                  name: trimmed,
                }
              : group
          )
          .sort((a, b) => b.count - a.count)
      );
      onLocalRename?.(oldName, trimmed);
      toast.success("分组已重命名");
      setEditing(null);
      onGroupsUpdated?.();
    });
  };

  const handleDelete = (name: string) => {
    startTransition(async () => {
      const res = await deleteProviderGroupAction(name);
      if (!res.ok) {
        toast.error(res.error || "删除分组失败");
        return;
      }
      setLocalGroups((prev) => prev.filter((group) => group.name !== name));
      onLocalDelete?.(name);
      toast.success("分组已删除");
      onGroupsUpdated?.();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>管理供应商分组</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-3">
          <div className="space-y-3">
            {localGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                暂无分组，创建新供应商时可输入新名称。
              </p>
            ) : (
              localGroups.map((group) => (
                <div
                  key={group.name}
                  className="flex items-center justify-between rounded-xl border border-border/60 p-3"
                >
                  <div className="flex flex-col">
                    {editing === group.name ? (
                      <Input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        disabled={isPending}
                        className="h-8 w-48"
                        autoFocus
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{group.name}</span>
                        <Badge variant="outline">{group.count} 个供应商</Badge>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {editing === group.name ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleRename(group.name)}
                          disabled={isPending}
                        >
                          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(null)}
                          disabled={isPending}
                        >
                          取消
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditing(group.name);
                            setInputValue(group.name);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => setPendingDelete(group.name)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>删除分组</AlertDialogTitle>
                              <AlertDialogDescription>
                                删除后，分组 &ldquo;{pendingDelete}&rdquo; 将从所有供应商中移除。
                                是否继续？
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="flex justify-end gap-2">
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => pendingDelete && handleDelete(pendingDelete)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                删除
                              </AlertDialogAction>
                            </div>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
