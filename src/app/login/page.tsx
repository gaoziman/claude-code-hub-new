"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, Book, User } from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/dashboard";

  const [showHttpWarning, setShowHttpWarning] = useState(false);

  // 密码登录状态
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // 检测是否为 HTTP（非 localhost）
  useEffect(() => {
    if (typeof window !== "undefined") {
      const isHttp = window.location.protocol === "http:";
      const isLocalhost =
        window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      setShowHttpWarning(isHttp && !isLocalhost);
    }
  }, []);

  // 密码登录处理
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordLoading(true);

    try {
      const response = await fetch("/api/auth/login-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setPasswordError(data.error || "登录失败");
        return;
      }

      // 登录成功，跳转到原页面
      router.push(from);
      router.refresh();
    } catch {
      setPasswordError("网络错误，请稍后重试");
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-background to-muted/40">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute right-[10%] top-[-6rem] h-72 w-72 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute bottom-[-4rem] left-[15%] h-80 w-80 rounded-full bg-orange-400/10 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-screen w-full items-center justify-center px-4 py-16">
        <Card className="w-full max-w-lg border border-border/70 bg-card/95 shadow-xl backdrop-blur">
          <CardHeader className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-500/15 text-orange-500">
                <User className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-2xl font-semibold">登录面板</CardTitle>
                <CardDescription>使用密码进入统一控制台</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {showHttpWarning ? (
              <Alert variant="destructive" className="mb-6">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Cookie 安全警告</AlertTitle>
                <AlertDescription className="mt-2 space-y-2 text-sm">
                  <p>您正在使用 HTTP 访问系统，浏览器安全策略可能阻止 Cookie 设置导致登录失败。</p>
                  <div className="mt-3">
                    <p className="font-medium">解决方案：</p>
                    <ol className="ml-4 mt-1 list-decimal space-y-1">
                      <li>使用 HTTPS 访问（推荐）</li>
                      <li>
                        在 .env 中设置{" "}
                        <code className="rounded bg-muted px-1 py-0.5 text-xs">
                          ENABLE_SECURE_COOKIES=false
                        </code>{" "}
                        （会降低安全性）
                      </li>
                    </ol>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            {/* 密码登录表单 */}
            <form onSubmit={handlePasswordSubmit} className="space-y-6">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="username">用户名</Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="username"
                      type="text"
                      placeholder="请输入用户名"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="pl-9"
                      required
                      disabled={passwordLoading}
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">密码</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="请输入密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={passwordLoading}
                    autoComplete="current-password"
                  />
                </div>

                {passwordError ? (
                  <Alert variant="destructive">
                    <AlertDescription>{passwordError}</AlertDescription>
                  </Alert>
                ) : null}
              </div>

              <div className="space-y-2 flex flex-col items-center">
                <Button
                  type="submit"
                  className="w-full max-w-full"
                  disabled={passwordLoading || !username.trim() || !password.trim()}
                >
                  {passwordLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      登录中...
                    </>
                  ) : (
                    "进入控制台"
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  首次登录请使用管理员分配的密码
                </p>
              </div>
            </form>

            {/* 文档页入口 */}
            <div className="mt-6 pt-6 border-t flex justify-center">
              <a
                href="/usage-doc"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Book className="h-4 w-4" />
                查看使用文档
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LoginPageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
