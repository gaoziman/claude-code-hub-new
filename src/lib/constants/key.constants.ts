/**
 * Key 级限额默认值与范围
 */
export const KEY_DEFAULTS = {
  RPM: 100,
  DAILY_QUOTA: 100,
} as const;

export const KEY_LIMITS = {
  RPM: {
    MIN: 1,
    MAX: 10_000,
  },
  DAILY_QUOTA: {
    MIN: 0.01,
    MAX: 1_000,
  },
  TOTAL_LIMIT: {
    MIN: 0.01,
    MAX: 1_000_000,
  },
} as const;
