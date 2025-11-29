import { config } from "@/lib/config/config";
import { getEnvConfig } from "@/lib/config/env.schema";
import { cookies } from "next/headers";
import { findActiveKeyByKeyString } from "@/repository/key";
import { findUserById } from "@/repository/user";
import type { Key } from "@/types/key";
import type { User } from "@/types/user";
import bcrypt from "bcryptjs";
import { logger } from "@/lib/logger";

const AUTH_COOKIE_NAME = "auth-token";
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface AuthSession {
  user: User;
  key: Key | null; // ⭐ 密码登录时为 null
  viewMode: "user" | "key";
}

/**
 * 通过用户名和密码验证（⭐ 新增）
 * 支持：
 * 1. 普通用户/代理用户：用户名+密码
 * 2. 管理员：用户名="admin"，密码=ADMIN_TOKEN
 */
export async function validatePassword(
  username: string,
  password: string
): Promise<AuthSession | null> {
  try {
    // ========== 特殊处理：Admin Token 登录 ==========
    const adminToken = config.auth.adminToken;
    if (adminToken && username === "superadmin" && password === adminToken) {
      logger.info(`[Auth] Admin Token login successful`);
      const now = new Date();
      const adminUser: User = {
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
        balanceUsd: 0,
        balanceUpdatedAt: null,
        balanceUsagePolicy: "after_quota",
      };

      return {
        user: adminUser,
        key: null,
        viewMode: "user",
      };
    }

    // ========== 普通用户登录 ==========
    // 1. 根据用户名查找用户
    const { findUserByName } = await import("@/repository/user");
    const user = await findUserByName(username);

    if (!user || !user.isEnabled) {
      logger.debug(`[Auth] User not found or disabled: ${username}`);
      return null;
    }

    // 2. 检查密码哈希是否存在
    if (!user.passwordHash) {
      logger.debug(`[Auth] User has no password hash: ${username}`);
      return null;
    }

    // 3. 检查用户是否过期
    if (user.expiresAt && user.expiresAt.getTime() <= Date.now()) {
      logger.debug(`[Auth] User expired: ${username}`);
      return null;
    }

    // 4. 验证密码
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      logger.debug(`[Auth] Invalid password for user: ${username}`);
      return null;
    }

    logger.info(`[Auth] Password login successful: ${username} (id=${user.id})`);

    // 5. 返回 session（密码登录时 key 为 null）
    return {
      user,
      key: null,
      viewMode: "user",
    };
  } catch (error) {
    logger.error(`[Auth] Password validation error:`, error);
    return null;
  }
}

/**
 * 生成随机密码（8位：大小写字母+数字）（⭐ 新增）
 */
export function generateRandomPassword(): string {
  // 移除易混淆字符：0 O I l 1
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let password = "";
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  for (let i = 0; i < 8; i++) {
    password += chars[array[i] % chars.length];
  }
  return password;
}

/**
 * 密码哈希（⭐ 新增）
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12; // bcrypt 成本因子
  return bcrypt.hash(password, saltRounds);
}

export async function validateKey(keyString: string): Promise<AuthSession | null> {
  const adminToken = config.auth.adminToken;
  logger.debug(
    `[Auth] validateKey: Checking key - keyString=${keyString.substring(0, 10)}..., adminToken=${adminToken?.substring(0, 10)}...`
  );

  if (adminToken && keyString === adminToken) {
    logger.info(`[Auth] validateKey: ADMIN_TOKEN matched!`);
    const now = new Date();
    const adminUser: User = {
      id: -1,
      name: "Admin Token",
      description: "Environment admin session",
      role: "admin",
      providerGroup: null,
      tags: [],
      isEnabled: true,
      expiresAt: null,

      // ⭐ 新增字段
      parentUserId: null,
      passwordHash: null,
      passwordUpdatedAt: null,
      forcePasswordChange: false,
      maxKeysCount: 3,
      inheritParentLimits: true,

      limit5hUsd: null,
      limitWeeklyUsd: null,
      limitMonthlyUsd: null,
      totalLimitUsd: null,
      billingCycleStart: null,
      balanceUsd: 0,
      balanceUpdatedAt: null,
      balanceUsagePolicy: "after_quota",
      createdAt: now,
      updatedAt: now,
    };

    const adminKey: Key = {
      id: -1,
      userId: adminUser.id,
      name: "ADMIN_TOKEN",
      key: keyString,
      isEnabled: true,
      canLoginWebUi: true, // Admin Token 始终可以登录 Web UI
      limit5hUsd: null,
      limitWeeklyUsd: null,
      limitMonthlyUsd: null,
      totalLimitUsd: null,
      billingCycleStart: null,
      limitConcurrentSessions: 0,
      rpmLimit: null,
      dailyLimitUsd: null,
      createdAt: now,
      updatedAt: now,
    };

    return { user: adminUser, key: adminKey, viewMode: "user" };
  }

  logger.debug(`[Auth] validateKey: ADMIN_TOKEN not matched, checking database key`);
  const key = await findActiveKeyByKeyString(keyString);
  if (!key) {
    logger.debug(`[Auth] validateKey: Key not found in database`);
    return null;
  }

  // 检查 Web UI 登录权限
  if (!key.canLoginWebUi) {
    logger.debug(`[Auth] validateKey: Key cannot login to Web UI`);
    return null;
  }

  const user = await findUserById(key.userId);
  if (!user) {
    logger.debug(`[Auth] validateKey: User not found for key`);
    return null;
  }

  logger.debug(`[Auth] validateKey: Database key validated - userId=${user.id}, name=${user.name}`);
  return {
    user,
    key,
    viewMode: "user",
  };
}

/**
 * 设置认证 Cookie（⭐ 修改：支持三种登录方式）
 */
export async function setAuthCookie(type: "key" | "password" | "admin-token", value: string) {
  const cookieStore = await cookies();
  const env = getEnvConfig();

  // Cookie 值格式：{ type: 'key' | 'password' | 'admin-token', value: string }
  const payload = JSON.stringify({ type, value });

  cookieStore.set(AUTH_COOKIE_NAME, payload, {
    httpOnly: true,
    secure: env.ENABLE_SECURE_COOKIES,
    sameSite: "lax",
    maxAge: AUTH_COOKIE_MAX_AGE,
    path: "/",
  });

  logger.debug(`[Auth] Cookie set: type=${type}`);
}

export async function getAuthCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE_NAME)?.value;
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
  logger.debug(`[Auth] Cookie cleared`);
}

/**
 * 获取当前 session（⭐ 修改：支持两种登录方式）
 */
export async function getSession(): Promise<AuthSession | null> {
  const cookieValue = await getAuthCookie();
  if (!cookieValue) {
    logger.debug("[Auth] getSession: No cookie found");
    return null;
  }

  try {
    // 尝试解析 JSON 格式（新格式）
    const { type, value } = JSON.parse(cookieValue);
    logger.debug(
      `[Auth] getSession: Parsed cookie - type=${type}, value=${value.substring(0, 10)}...`
    );

    if (type === "key") {
      const session = await validateKey(value);
      logger.debug(`[Auth] getSession: Key validation result - ${session ? "success" : "failed"}`);
      return session;
    } else if (type === "admin-token") {
      // Admin Token 登录：返回虚拟 admin user
      const now = new Date();
      const adminUser: User = {
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
        balanceUsd: 0,
        balanceUpdatedAt: null,
        balanceUsagePolicy: "after_quota",
      };
      logger.debug(`[Auth] getSession: Admin Token login - returning virtual admin user`);
      return { user: adminUser, key: null, viewMode: "user" };
    } else if (type === "password") {
      // 密码登录：直接从用户 ID 获取用户
      const userId = parseInt(value);
      const user = await findUserById(userId);
      if (!user || !user.isEnabled) {
        logger.debug(`[Auth] getSession: Password user not found or disabled - userId=${userId}`);
        return null;
      }
      logger.debug(
        `[Auth] getSession: Password login success - userId=${userId}, name=${user.name}`
      );
      return { user, key: null, viewMode: "user" };
    }

    logger.debug(`[Auth] getSession: Unknown type - ${type}`);
    return null;
  } catch (error) {
    // 向后兼容：旧格式（直接是 key 字符串）
    logger.debug(`[Auth] getSession: JSON parse failed, trying legacy format - ${error}`);
    const session = await validateKey(cookieValue);
    logger.debug(`[Auth] getSession: Legacy validation result - ${session ? "success" : "failed"}`);
    return session;
  }
}

export function hasOwnerView(session: AuthSession): boolean {
  return session.viewMode === "user";
}

export function hasChildView(session: AuthSession): boolean {
  return session.viewMode === "key";
}
