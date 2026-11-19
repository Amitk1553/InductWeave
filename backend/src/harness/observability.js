import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getObservabilityRaw, insertLlmMetric, updateLlmMetric } from '../db/queries/stats.js';

/** Records one Gemini call; returns the metric id so validation results can be attached later. */
export async function recordLlmCall({ operation, latencyMs, tokensIn = null, tokensOut = null, success, error = null, confidence = null }) {
  try {
    return await insertLlmMetric({
      operation,
      model: env.GEMINI_MODEL,
      promptVersion: env.PROMPT_VERSION,
      latencyMs: Math.round(latencyMs),
      tokensIn,
      tokensOut,
      success,
      error: error ? String(error).slice(0, 500) : null,
      confidence,
    });
  } catch (err) {
    logger.error({ err }, 'failed to record llm metric');
    return null;
  }
}

/** Called after guardrail validation so `success` reflects usable output, not just an HTTP 200. */
export async function finalizeLlmCall(metricId, patch) {
  if (!metricId) return;
  try {
    await updateLlmMetric(metricId, patch);
  } catch (err) {
    logger.error({ err, metricId }, 'failed to update llm metric');
  }
}

const BUCKET_ORDER = ['<0.5s', '0.5-1s', '1-2s', '2-5s', '5-10s', '10s+'];

export async function getMetrics() {
  const raw = await getObservabilityRaw();
  const counts = Object.fromEntries(raw.buckets.map((b) => [b.bucket, b.count]));
  const { total, modified } = raw.aiTasks;

  return {
    avgLatencyMs: raw.llm.avgLatencyMs,
    p95LatencyMs: raw.llm.p95LatencyMs,
    aiSuccessRate: raw.llm.successRate,
    totalLlmCalls: raw.llm.calls,
    fallbackCount: raw.fallbackCount,
    avgConfidence: raw.llm.avgConfidence,
    aiTasksModifiedPct: total ? modified / total : null,
    aiTasksTotal: total,
    topEscalationReasons: raw.escalationReasons,
    avgOnboardingDays: raw.avgOnboardingDays,
    latencyHistogram: BUCKET_ORDER.map((bucket) => ({ bucket, count: counts[bucket] ?? 0 })),
    dailyTrend: raw.daily,
    promptInjectionCount: raw.promptInjectionCount,
    unansweredChatCount: raw.unansweredChatCount,
    chatQueryCount: raw.chatQueryCount,
  };
}

export const observability = { recordLlmCall, finalizeLlmCall, getMetrics };
