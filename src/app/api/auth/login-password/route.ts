import { NextRequest, NextResponse } from "next/server";
import { validatePassword, setAuthCookie } from "@/lib/auth";
import { logger } from "@/lib/logger";

/**
 * 密码登录 API
 * POST /api/auth/login-password
 * Body: { username: string, password: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: "用户名和密码不能为空" }, { status: 400 });
    }

    // 验证用户名和密码
    const session = await validatePassword(username, password);

    if (!session) {
      logger.warn(`[Auth] Password login failed - ${username}`);
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    // 设置认证 cookie
    // Admin Token 登录使用特殊类型，避免从数据库查询虚拟用户
    const cookieType = session.user.id === -1 ? "admin-token" : "password";
    await setAuthCookie(cookieType, session.user.id.toString());

    logger.info(`[Auth] Password login successful: ${username} (${session.user.role})`);

    // 返回用户信息
    return NextResponse.json({
      ok: true,
      user: {
        id: session.user.id,
        name: session.user.name,
        role: session.user.role,
        isEnabled: session.user.isEnabled,
        forcePasswordChange: session.user.forcePasswordChange,
      },
    });
  } catch (error) {
    logger.error("[Auth] Password login error:", error);
    return NextResponse.json({ error: "登录失败，请稍后重试" }, { status: 500 });
  }
}
