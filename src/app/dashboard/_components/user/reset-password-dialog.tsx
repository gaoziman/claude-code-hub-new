"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Check, AlertTriangle, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { resetUserPassword } from "@/actions/users";

interface ResetPasswordDialogProps {
  open: boolean;
  onClose: () => void;
  userId: number;
  username: string;
}

export function ResetPasswordDialog({
  open,
  onClose,
  userId,
  username,
}: ResetPasswordDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [password, setPassword] = useState("");
  const [hasReset, setHasReset] = useState(false);

  const handleReset = () => {
    startTransition(async () => {
      try {
        const res = await resetUserPassword(userId);

        if (!res.ok) {
          toast.error(res.error || "重置密码失败");
          return;
        }

        setPassword(res.data?.password || "");
        setHasReset(true);
        toast.success("密码重置成功");
      } catch (error) {
        console.error("重置密码失败:", error);
        toast.error("重置密码失败，请稍后重试");
      }
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      toast.success("密码已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("复制失败，请手动复制");
    }
  };

  const handleDownload = () => {
    const content = `用户名: ${username}\n重置后的密码: ${password}\n重置时间: ${new Date().toLocaleString("zh-CN")}\n\n请妥善保管此密码，关闭此窗口后将无法再次查看。`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `用户密码重置-${username}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("密码已下载");
  };

  const handleClose = () => {
    setPassword("");
    setHasReset(false);
    setCopied(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/15 text-orange-600">
              <AlertTriangle className="h-4 w-4" />
            </span>
            重置用户密码
          </DialogTitle>
          <DialogDescription>
            为用户 <strong>{username}</strong> 重置密码
          </DialogDescription>
        </DialogHeader>

        {!hasReset ? (
          <>
            <Alert variant="default" className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>注意事项</AlertTitle>
              <AlertDescription className="mt-2 space-y-1 text-sm">
                <p>• 重置后会生成新的随机密码</p>
                <p>• 新密码仅显示一次，请妥善保管</p>
                <p>• 用户的旧密码将立即失效</p>
              </AlertDescription>
            </Alert>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={handleClose}>
                取消
              </Button>
              <Button type="button" onClick={handleReset} disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    重置中...
                  </>
                ) : (
                  "确认重置"
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <Alert variant="destructive" className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>重要提示</AlertTitle>
              <AlertDescription className="mt-2 space-y-1 text-sm">
                <p>• 此密码仅显示一次，关闭后无法再次查看</p>
                <p>• 请立即复制或下载保存，并通过安全方式传递给用户</p>
                <p>• 建议用户登录后立即修改密码</p>
              </AlertDescription>
            </Alert>

            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="reset-password" className="text-sm font-medium">
                  新密码
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="reset-password"
                    type="text"
                    value={password}
                    readOnly
                    className="font-mono text-base bg-muted"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopy}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  密码长度 8 位，包含数字和字母（已排除易混淆字符）
                </p>
              </div>
            </div>

            <DialogFooter className="flex flex-row gap-2 sm:justify-between mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleDownload}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                下载为文本
              </Button>
              <Button type="button" onClick={handleClose}>
                我已保存，关闭
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
