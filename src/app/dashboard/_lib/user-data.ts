import type { UsageTimeRangeValue } from "@/lib/time-range";
import type { UserDisplay } from "@/types/user";

interface ActionApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function fetchUsersByTimeRange(range: UsageTimeRangeValue): Promise<UserDisplay[]> {
  const response = await fetch("/api/actions/users/getUsers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({ timeRange: range }),
  });

  if (!response.ok) {
    throw new Error("无法加载用户数据");
  }

  const payload = (await response.json()) as ActionApiResponse<UserDisplay[]>;
  if (!payload.ok) {
    throw new Error(payload.error || "加载用户数据失败");
  }

  return payload.data ?? [];
}

// 获取当前用户的完整数据（用于 API 密钥页面）
export async function fetchCurrentUserByTimeRange(
  range: UsageTimeRangeValue
): Promise<UserDisplay | null> {
  const response = await fetch("/api/actions/users/getCurrentUserWithUsage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({ timeRange: range }),
  });

  if (!response.ok) {
    throw new Error("无法加载用户数据");
  }

  const payload = (await response.json()) as ActionApiResponse<UserDisplay>;
  if (!payload.ok) {
    throw new Error(payload.error || "加载用户数据失败");
  }

  return payload.data ?? null;
}

export function getLastActivity(user: UserDisplay): Date | null {
  const timestamps = user.keys
    .map((key) => (key.lastUsedAt ? new Date(key.lastUsedAt).getTime() : null))
    .filter(Boolean) as number[];
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}

export function getUserMetrics(user: UserDisplay) {
  const activeKeyCount = user.keys.filter((key) => key.status === "enabled").length;
  const todayCalls = user.keys.reduce((sum, key) => sum + (key.todayCallCount ?? 0), 0);
  const todayUsage = user.keys.reduce((sum, key) => sum + (key.todayUsage ?? 0), 0);
  const lastActivity = getLastActivity(user);
  return {
    activeKeyCount,
    totalKeys: user.keys.length,
    todayCalls,
    todayUsage,
    lastActivity,
  };
}
