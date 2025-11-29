import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "./_components/change-password-form";

export default async function AccountPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-3xl font-bold">账户设置</h1>
        <p className="text-muted-foreground mt-2">管理你的账户安全和个人信息</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>修改密码</CardTitle>
          <CardDescription>定期更换密码可以提高账户安全性</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>账户信息</CardTitle>
          <CardDescription>你的基本账户信息</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">用户名</p>
              <p className="mt-1 font-medium">{session.user.name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">角色</p>
              <p className="mt-1 font-medium">
                {session.user.role === "admin"
                  ? "管理员"
                  : session.user.role === "reseller"
                    ? "代理"
                    : "用户"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
