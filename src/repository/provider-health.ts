"use server";

import { db } from "@/drizzle/db";
import { sql } from "drizzle-orm";

const DEFAULT_WINDOW_HOURS = 24;
const MIN_WINDOW_HOURS = 1;
const MAX_WINDOW_HOURS = 168; // one week

export interface ProviderHealthScore {
  providerId: number;
  providerName: string;
  providerType: string;
  groupTag: string | null;
  totalRequests: number;
  successCount: number;
  successRate: number; // 0-1
  errorCount: number;
  p95LatencyMs: number | null;
  circuitEvents: number;
  costStddev: number;
  healthScore: number; // 0-100
  metrics: {
    successScore: number;
    latencyScore: number;
    circuitScore: number;
    costScore: number;
  };
}

export interface ProviderHealthReport {
  windowHours: number;
  generatedAt: Date;
  providers: ProviderHealthScore[];
  summary: {
    providerCount: number;
    totalRequests: number;
    averageSuccessRate: number;
    averageP95Latency: number | null;
  };
}

function normalizeWindowHours(value?: number): number {
  if (!value || Number.isNaN(value)) {
    return DEFAULT_WINDOW_HOURS;
  }
  return Math.min(Math.max(value, MIN_WINDOW_HOURS), MAX_WINDOW_HOURS);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function getProviderHealthReport(params?: {
  windowHours?: number;
}): Promise<ProviderHealthReport> {
  const windowHours = normalizeWindowHours(params?.windowHours);
  const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const windowStartIso = windowStart.toISOString();

  const rows = await db.execute(sql`
    with base as (
      select
        mr.provider_id,
        count(*)::bigint as total_requests,
        sum(case when mr.status_code between 200 and 299 then 1 else 0 end)::bigint as success_count,
        sum(case when mr.status_code >= 500 or mr.status_code is null then 1 else 0 end)::bigint as error_count,
        percentile_cont(0.95) within group (order by mr.duration_ms) filter (where mr.duration_ms is not null) as p95_latency,
        coalesce(stddev_pop((mr.cost_multiplier)::double precision), 0)::double precision as cost_stddev
      from message_request mr
      where mr.created_at >= ${windowStartIso}
        and mr.deleted_at is null
      group by mr.provider_id
    ),
    circuit as (
      select
        mr.provider_id,
        count(*)::bigint as circuit_events
      from message_request mr
      cross join lateral jsonb_array_elements(coalesce(mr.provider_chain, '[]'::jsonb)) as elem(entry)
      where mr.created_at >= ${windowStartIso}
        and mr.deleted_at is null
        and elem.entry->>'reason' = 'retry_failed'
      group by mr.provider_id
    )
    select
      base.*,
      coalesce(circuit.circuit_events, 0)::bigint as circuit_events,
      p.name,
      p.group_tag,
      p.provider_type,
      p.cost_multiplier as base_cost_multiplier
    from base
    join providers p on p.id = base.provider_id
    left join circuit on circuit.provider_id = base.provider_id
    where p.deleted_at is null
  `);

  const providers: ProviderHealthScore[] = rows.map((row) => {
    const totalRequests = Number(row.total_requests ?? 0);
    const successCount = Number(row.success_count ?? 0);
    const errorCount = Number(row.error_count ?? 0);
    const successRate = totalRequests > 0 ? successCount / totalRequests : 0;
    const p95Latency = formatNumber(row.p95_latency);
    const costStddev = formatNumber(row.cost_stddev) ?? 0;
    const circuitEvents = Number(row.circuit_events ?? 0);

    const latencyScore = p95Latency === null ? 1 : clamp(1 - p95Latency / 5000, 0, 1);
    const circuitRate = totalRequests > 0 ? circuitEvents / totalRequests : 0;
    const circuitScore = clamp(1 - circuitRate, 0, 1);
    const costScore = clamp(1 - costStddev / 0.5, 0, 1);
    const successScore = clamp(successRate, 0, 1);

    const healthScore =
      (successScore * 0.4 + latencyScore * 0.25 + circuitScore * 0.2 + costScore * 0.15) * 100;

    return {
      providerId: Number(row.provider_id),
      providerName: (row.name as string) ?? "Unknown",
      providerType: (row.provider_type as string) ?? "unknown",
      groupTag: (row.group_tag as string) ?? null,
      totalRequests,
      successCount,
      successRate,
      errorCount,
      p95LatencyMs: p95Latency,
      circuitEvents,
      costStddev,
      healthScore,
      metrics: {
        successScore: successScore * 100,
        latencyScore: latencyScore * 100,
        circuitScore: circuitScore * 100,
        costScore: costScore * 100,
      },
    };
  });

  const providerCount = providers.length;
  const totalRequests = providers.reduce((sum, p) => sum + p.totalRequests, 0);
  const averageSuccessRate =
    providerCount > 0 ? providers.reduce((sum, p) => sum + p.successRate, 0) / providerCount : 0;
  const averageP95Latency =
    providerCount > 0
      ? (() => {
          const values = providers
            .map((p) => p.p95LatencyMs)
            .filter((v): v is number => typeof v === "number");
          if (values.length === 0) return null;
          return values.reduce((sum, v) => sum + v, 0) / values.length;
        })()
      : null;

  return {
    windowHours,
    generatedAt: new Date(),
    providers: providers.sort((a, b) => b.healthScore - a.healthScore),
    summary: {
      providerCount,
      totalRequests,
      averageSuccessRate,
      averageP95Latency,
    },
  };
}
