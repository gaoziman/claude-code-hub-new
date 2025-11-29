"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Eye, EyeOff, Check } from "lucide-react";
import { changePassword } from "@/actions/users";
import { toast } from "sonner";

export function ChangePasswordForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // 前端验证
    if (!oldPassword || !newPassword || !confirmPassword) {
      setError("请填写所有字段");
      return;
    }

    if (newPassword.length < 6) {
      setError("新密码长度不能少于 6 位");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }

    if (oldPassword === newPassword) {
      setError("新密码不能与旧密码相同");
      return;
    }

    startTransition(async () => {
      try {
        const res = await changePassword({
          oldPassword,
          newPassword,
        });

        if (!res.ok) {
          setError(res.error || "修改密码失败");
          return;
        }

        toast.success("密码修改成功，请使用新密码重新登录");

        // 延迟 1 秒后退出登录并跳转
        setTimeout(async () => {
          try {
            // 调用 logout API 清除 session
            await fetch("/api/auth/logout", { method: "POST" });
          } catch (err) {
            console.error("退出登录失败:", err);
          } finally {
            // 跳转到登录页面
            router.push("/login");
            router.refresh();
          }
        }, 1000);
      } catch (err) {
        console.error("修改密码失败:", err);
        setError("修改密码失败，请稍后重试");
      }
    });
  };

  const passwordStrength = (password: string): { level: number; text: string; color: string } => {
    if (password.length === 0) return { level: 0, text: "", color: "" };
    if (password.length < 6) return { level: 1, text: "弱", color: "text-destructive" };

    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    if (strength <= 2) return { level: 1, text: "弱", color: "text-destructive" };
    if (strength <= 3) return { level: 2, text: "中", color: "text-yellow-600" };
    return { level: 3, text: "强", color: "text-green-600" };
  };

  const strength = passwordStrength(newPassword);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="old-password">当前密码</Label>
        <div className="relative">
          <Input
            id="old-password"
            type={showOldPassword ? "text" : "password"}
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            placeholder="请输入当前密码"
            disabled={isPending}
            className="pr-10"
            autoComplete="current-password"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
            onClick={() => setShowOldPassword(!showOldPassword)}
            tabIndex={-1}
          >
            {showOldPassword ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-password">新密码</Label>
        <div className="relative">
          <Input
            id="new-password"
            type={showNewPassword ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="请输入新密码（至少 6 位）"
            disabled={isPending}
            className="pr-10"
            autoComplete="new-password"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
            onClick={() => setShowNewPassword(!showNewPassword)}
            tabIndex={-1}
          >
            {showNewPassword ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>
        {newPassword && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">密码强度:</span>
            <span className={strength.color}>{strength.text}</span>
            <div className="ml-2 flex flex-1 gap-1">
              {[1, 2, 3].map((level) => (
                <div
                  key={level}
                  className={`h-1.5 flex-1 rounded-full ${
                    level <= strength.level
                      ? strength.level === 1
                        ? "bg-destructive"
                        : strength.level === 2
                          ? "bg-yellow-600"
                          : "bg-green-600"
                      : "bg-muted"
                  }`}
                />
              ))}
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          建议使用至少 8 位，包含大小写字母、数字和特殊字符的密码
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">确认新密码</Label>
        <div className="relative">
          <Input
            id="confirm-password"
            type={showConfirmPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="请再次输入新密码"
            disabled={isPending}
            className="pr-10"
            autoComplete="new-password"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            tabIndex={-1}
          >
            {showConfirmPassword ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>
        {confirmPassword && (
          <div className="flex items-center gap-1 text-sm">
            {newPassword === confirmPassword ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-600" />
                <span className="text-green-600">密码匹配</span>
              </>
            ) : (
              <span className="text-destructive">密码不匹配</span>
            )}
          </div>
        )}
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={isPending || !oldPassword || !newPassword || !confirmPassword}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            修改中...
          </>
        ) : (
          "确认修改"
        )}
      </Button>
    </form>
  );
}
