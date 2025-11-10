import { getRedisClient } from "./client";

export type PersistedCircuitBreakerHealth = {
  circuitState: "closed" | "open" | "half-open";
  failureCount: number;
  lastFailureTime: number | null;
  circuitOpenUntil: number | null;
  halfOpenSuccessCount: number;
  updatedAt: number;
};

const KEY_PREFIX = "cb:health";
const TTL_SECONDS = 60 * 60 * 24; // 24 小时

function buildKey(providerId: number) {
  return `${KEY_PREFIX}:${providerId}`;
}

export async function saveCircuitBreakerHealthSnapshot(
  providerId: number,
  snapshot: PersistedCircuitBreakerHealth
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    await redis.set(buildKey(providerId), JSON.stringify(snapshot), "EX", TTL_SECONDS);
  } catch {
    // 降级为本地内存，不抛出
  }
}

export async function getCircuitBreakerHealthSnapshot(
  providerId: number
): Promise<PersistedCircuitBreakerHealth | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    const raw = await redis.get(buildKey(providerId));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedCircuitBreakerHealth;
  } catch {
    return null;
  }
}

export async function getCircuitBreakerHealthSnapshots(
  providerIds: number[]
): Promise<Record<number, PersistedCircuitBreakerHealth>> {
  const redis = getRedisClient();
  if (!redis || providerIds.length === 0) return {};

  const pipeline = redis.multi();
  providerIds.forEach((id) => pipeline.get(buildKey(id)));

  try {
    const results = await pipeline.exec();
    const map: Record<number, PersistedCircuitBreakerHealth> = {};
    if (!results) {
      return map;
    }

    results.forEach((result, index) => {
      const value = result?.[1];
      if (typeof value === "string") {
        try {
          map[providerIds[index]] = JSON.parse(value) as PersistedCircuitBreakerHealth;
        } catch {
          // 忽略解析错误
        }
      }
    });
    return map;
  } catch {
    return {};
  }
}
