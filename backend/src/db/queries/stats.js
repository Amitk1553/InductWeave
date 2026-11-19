import { eq, sql } from 'drizzle-orm';
import { db } from '../client.js';
import { llmMetrics } from '../schema.js';

export async function insertLlmMetric(data) {
  const [row] = await db.insert(llmMetrics).values(data).returning({ id: llmMetrics.id });
  return row.id;
}

export async function updateLlmMetric(id, patch) {
  await db.update(llmMetrics).set(patch).where(eq(llmMetrics.id, id));
}

const one = async (query) => (await db.execute(query)).rows[0] ?? {};
const num = (v) => (v === null || v === undefined ? null : Number(v));

export async function getObservabilityRaw() {
  const llm = await one(sql`
    SELECT count(*)::int AS calls,
           avg(latency_ms) AS avg_latency,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency,
           count(*) FILTER (WHERE success)::float / NULLIF(count(*), 0) AS success_rate,
           avg(confidence) AS avg_confidence
    FROM llm_metrics`);

  const { rows: buckets } = await db.execute(sql`
    SELECT CASE
             WHEN latency_ms < 500 THEN '<0.5s'
             WHEN latency_ms < 1000 THEN '0.5-1s'
             WHEN latency_ms < 2000 THEN '1-2s'
             WHEN latency_ms < 5000 THEN '2-5s'
             WHEN latency_ms < 10000 THEN '5-10s'
             ELSE '10s+'
           END AS bucket,
           count(*)::int AS count
    FROM llm_metrics GROUP BY 1`);

  const { rows: daily } = await db.execute(sql`
    SELECT created_at::date::text AS date,
           avg(confidence) AS avg_confidence,
           count(*) FILTER (WHERE success)::int AS success,
           count(*) FILTER (WHERE NOT success)::int AS failed
    FROM llm_metrics
    WHERE created_at > now() - interval '14 days'
    GROUP BY 1 ORDER BY 1`);

  const fallback = await one(sql`SELECT count(*)::int AS n FROM onboarding_plans WHERE generation_mode = 'fallback'`);
  const aiTasks = await one(sql`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE hr_modified)::int AS modified
    FROM tasks WHERE source = 'ai'`);
  const { rows: reasons } = await db.execute(sql`
    SELECT type, count(*)::int AS count FROM escalations GROUP BY type ORDER BY count DESC LIMIT 6`);
  const completion = await one(sql`
    SELECT avg(EXTRACT(EPOCH FROM (c.last_done - p.approved_at)) / 86400) AS days
    FROM onboarding_plans p
    JOIN (SELECT plan_id, max(completed_at) AS last_done FROM tasks GROUP BY plan_id) c ON c.plan_id = p.id
    WHERE p.status = 'completed' AND p.approved_at IS NOT NULL AND c.last_done IS NOT NULL`);
  const audit = await one(sql`
    SELECT count(*) FILTER (WHERE event_type = 'prompt_injection_suspected')::int AS injections,
           count(*) FILTER (WHERE event_type = 'chat_unanswered')::int AS unanswered,
           count(*) FILTER (WHERE event_type = 'chat_query')::int AS chat_queries
    FROM audit_log`);

  return {
    llm: {
      calls: llm.calls ?? 0,
      avgLatencyMs: num(llm.avg_latency),
      p95LatencyMs: num(llm.p95_latency),
      successRate: num(llm.success_rate),
      avgConfidence: num(llm.avg_confidence),
    },
    buckets,
    daily: daily.map((d) => ({
      date: d.date,
      avgConfidence: num(d.avg_confidence),
      success: d.success,
      failed: d.failed,
    })),
    fallbackCount: fallback.n ?? 0,
    aiTasks: { total: aiTasks.total ?? 0, modified: aiTasks.modified ?? 0 },
    escalationReasons: reasons,
    avgOnboardingDays: num(completion.days),
    promptInjectionCount: audit.injections ?? 0,
    unansweredChatCount: audit.unanswered ?? 0,
    chatQueryCount: audit.chat_queries ?? 0,
  };
}

/** scope: { role: 'hr' } | { role: 'manager', clerkId } */
export async function getDashboardRaw(scope) {
  const scoped = scope.role === 'manager' ? sql`AND e.manager_clerk_id = ${scope.clerkId}` : sql``;
  const live = sql`p.status IN ('approved', 'in_progress', 'completed')`;

  const { rows: byDepartment } = await db.execute(sql`
    SELECT e.department,
           count(DISTINCT e.id)::int AS employees,
           count(t.id) FILTER (WHERE t.status = 'completed')::int AS done,
           count(t.id)::int AS total,
           count(t.id) FILTER (WHERE t.status IN ('overdue', 'escalated'))::int AS overdue
    FROM employees e
    JOIN onboarding_plans p ON p.employee_id = e.id AND ${live}
    JOIN tasks t ON t.plan_id = p.id
    WHERE true ${scoped}
    GROUP BY e.department ORDER BY e.department`);

  const { rows: byCategory } = await db.execute(sql`
    SELECT t.category,
           count(*)::int AS total,
           count(*) FILTER (WHERE t.status = 'completed')::int AS completed,
           count(*) FILTER (WHERE t.status IN ('overdue', 'escalated'))::int AS overdue
    FROM employees e
    JOIN onboarding_plans p ON p.employee_id = e.id AND ${live}
    JOIN tasks t ON t.plan_id = p.id
    WHERE true ${scoped}
    GROUP BY t.category ORDER BY t.category`);

  const { rows: perDay } = await db.execute(sql`
    SELECT t.completed_at::date::text AS date, count(*)::int AS count
    FROM employees e
    JOIN onboarding_plans p ON p.employee_id = e.id
    JOIN tasks t ON t.plan_id = p.id
    WHERE t.completed_at > now() - interval '14 days' ${scoped}
    GROUP BY 1 ORDER BY 1`);

  const { rows: commonlyLate } = await db.execute(sql`
    SELECT t.title, count(*)::int AS count
    FROM employees e
    JOIN onboarding_plans p ON p.employee_id = e.id
    JOIN tasks t ON t.plan_id = p.id
    WHERE (t.status IN ('overdue', 'escalated') OR (t.completed_at IS NOT NULL AND t.completed_at::date > t.due_date))
      ${scoped}
    GROUP BY t.title ORDER BY count DESC, t.title LIMIT 5`);

  const { rows: employeeStatus } = await db.execute(sql`
    SELECT e.status, count(*)::int AS count FROM employees e WHERE true ${scoped} GROUP BY e.status`);

  const avg = await one(sql`
    SELECT avg(EXTRACT(EPOCH FROM (c.last_done - p.approved_at)) / 86400) AS days
    FROM employees e
    JOIN onboarding_plans p ON p.employee_id = e.id AND p.status = 'completed' AND p.approved_at IS NOT NULL
    JOIN (SELECT plan_id, max(completed_at) AS last_done FROM tasks GROUP BY plan_id) c ON c.plan_id = p.id
    WHERE c.last_done IS NOT NULL ${scoped}`);

  const pendingApproval = await one(sql`
    SELECT count(*)::int AS n FROM onboarding_plans p JOIN employees e ON e.id = p.employee_id
    WHERE p.status = 'draft' ${scoped}`);

  return {
    byDepartment,
    byCategory,
    perDay,
    commonlyLate,
    employeeStatus,
    avgOnboardingDays: num(avg.days),
    pendingApproval: pendingApproval.n ?? 0,
  };
}
