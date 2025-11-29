import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { isDevelopment } from "@/lib/config/env.schema";
import { validateKey, validatePassword } from "@/lib/auth";
import { findUserById } from "@/repository/user";

// 使用 Node.js runtime 以支持数据库连接（postgres-js 需要 net 模块）
export const runtime = "nodejs";

const PUBLIC_PATHS = [
  "/login",
  "/usage-doc",
  "/api/auth/login",
  "/api/auth/login-password",
  "/api/auth/logout",
  "/_next",
  "/favicon.ico",
];

const API_PROXY_PATH = "/v1";

export async function middleware(request: NextRequest) {
  const method = request.method;
  const pathname = request.nextUrl.pathname;

  if (isDevelopment()) {
    logger.info("Request received", { method: method.toUpperCase(), pathname });
  }

  // API 代理路由不需要 Web 鉴权（使用自己的 Bearer token）
  if (pathname.startsWith(API_PROXY_PATH)) {
    return NextResponse.next();
  }

  // 公开路径不需要鉴权
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  if (isPublicPath) {
    return NextResponse.next();
  }

  // 检查认证 cookie
  const authToken = request.cookies.get("auth-token");

  if (!authToken) {
    // 未登录，重定向到登录页
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // 解析 Cookie 并验证 session
  let session = null;

  try {
    // 尝试解析 JSON 格式的 Cookie（新格式）
    const { type, value } = JSON.parse(authToken.value);
    logger.debug(`[Middleware] Parsed cookie - type=${type}, value=${value.substring(0, 10)}...`);

    if (type === "key") {
      // Key 登录方式
      session = await validateKey(value);
      logger.debug(`[Middleware] Key validation result - ${session ? "success" : "failed"}`);
    } else if (type === "admin-token") {
      // Admin Token 登录方式：返回虚拟 admin user
      const now = new Date();
      session = {
        user: {
          id: -1,
          name: "Admin Token",
          description: "Environment admin session",
          role: "admin",
          providerGroup: null,
          tags: [],
          isEnabled: true,
          expiresAt: null,
          createdAt: now,
          updatedAt: now,
          parentUserId: null,
          passwordHash: null,
          passwordUpdatedAt: null,
          forcePasswordChange: false,
          maxKeysCount: 999,
          limit5hUsd: null,
          limitWeeklyUsd: null,
          limitMonthlyUsd: null,
          totalLimitUsd: null,
          inheritParentLimits: false,
          billingCycleStart: null,
          balanceUsd: null,
          balanceUpdatedAt: null,
          deletedAt: null,
        },
        key: null,
        viewMode: "user",
      };
      logger.debug(`[Middleware] Admin Token session validated`);
    } else if (type === "password") {
      // 密码登录方式：从用户 ID 获取用户
      const userId = parseInt(value);
      const user = await findUserById(userId);

      if (user && user.isEnabled) {
        // 检查用户是否过期
        if (!user.expiresAt || user.expiresAt.getTime() > Date.now()) {
          session = { user, key: null, viewMode: "user" };
          logger.debug(
            `[Middleware] Password session validated - userId=${userId}, name=${user.name}`
          );
        } else {
          logger.debug(`[Middleware] User expired - userId=${userId}`);
        }
      } else {
        logger.debug(`[Middleware] User not found or disabled - userId=${userId}`);
      }
    } else {
      logger.debug(`[Middleware] Unknown cookie type - ${type}`);
    }
  } catch (error) {
    logger.debug(`[Middleware] JSON parse failed, trying legacy format - ${error}`);
    session = await validateKey(authToken.value);
    logger.debug(`[Middleware] Legacy validation result - ${session ? "success" : "failed"}`);
  }

  if (!session) {
    // Session 无效，清除 cookie 并重定向到登录页
    logger.debug(`[Middleware] Session validation failed, redirecting to login`);
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    const response = NextResponse.redirect(url);
    response.cookies.delete("auth-token");
    return response;
  }

  logger.debug(`[Middleware] Session validated successfully - user=${session.user.name}`);
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
