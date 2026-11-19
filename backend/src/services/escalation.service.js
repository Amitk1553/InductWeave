import { and, eq, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { onboardingPlans, tasks as tasksTable } from '../db/schema.js';
import { listUnconfirmedLowConfidence, listLiveTasks } from '../db/queries/tasks.js';
import { createEscalationIfNew, getEscalation, resolveEscalation } from '../db/queries/escalations.js';
import { auditLogger, AUDIT_EVENTS } from '../harness/auditLogger.js';
import { logger } from '../config/logger.js';
import { daysBetween, todayStr } from '../lib/dates.js';
import { notFound, conflict } from '../lib/errors.js';

const BACKGROUND_CHECK = /background (check|verification)/i;

/** Creates an escalation unless an identical one is already open; audits the new one. */
export async function raise(spec, { actor = 'system' } = {}) {
  const row = await createEscalationIfNew(spec);
  if (row) {
    await auditLogger.log({
      eventType: AUDIT_EVENTS.ESCALATION_RAISED,
      employeeId: spec.employeeId,
      actor,
      details: spec.message,
      metadata: { escalation_id: row.id, type: spec.type, severity: spec.severity, task_id: spec.taskId ?? null, plan_id: spec.planId ?? null },
    });
  }
  return row;
}

export async function raiseLowConfidence({ planId, employeeId, count }) {
  return raise({
    employeeId,
    planId,
    type: 'low_confidence_review',
    severity: 'critical',
    message: `${count} task(s) have AI confidence below 0.3 and need explicit HR confirmation before approval`,
  });
}

export async function resolve(id, { actor }) {
  const existing = await getEscalation(id);
  if (!existing) throw notFound('Escalation not found');
  const row = await resolveEscalation(id);
  if (!row) throw conflict('Escalation is already resolved');
  await auditLogger.log({
    eventType: AUDIT_EVENTS.ESCALATION_RESOLVED,
    employeeId: row.employeeId,
    actor,
    details: `Resolved escalation: ${row.message}`,
    metadata: { escalation_id: id, type: row.type },
  });
  return row;
}

async function markOverdue(task) {
  await db.update(tasksTable).set({ status: 'overdue' }).where(eq(tasksTable.id, task.id));
  await auditLogger.log({
    eventType: AUDIT_EVENTS.TASK_STATUS_CHANGED,
    employeeId: task.employeeId,
    actor: 'system',
    details: `"${task.title}" became overdue`,
    metadata: { task_id: task.id, from: task.status, to: 'overdue' },
  });
}

async function markEscalated(task) {
  await db.update(tasksTable).set({ status: 'escalated' }).where(eq(tasksTable.id, task.id));
  await auditLogger.log({
    eventType: AUDIT_EVENTS.TASK_STATUS_CHANGED,
    employeeId: task.employeeId,
    actor: 'system',
    details: `"${task.title}" escalated: overdue and blocking other tasks`,
    metadata: { task_id: task.id, from: 'overdue', to: 'escalated' },
  });
}

/**
 * Evaluates all escalation triggers. Idempotent: open escalations are never duplicated.
 * (The sixth trigger, LLM generation failure, is raised at generation time by the fallback handler.)
 */
export async function runScan() {
  const today = todayStr();
  const summary = { overdue: 0, blockers: 0, lowConfidence: 0, backgroundCheck: 0, startUrgency: 0, created: 0 };
  const count = (row) => {
    if (row) summary.created += 1;
  };

  const live = await listLiveTasks();
  const openDependedOn = new Set(
    live.filter((t) => t.status !== 'completed').flatMap((t) => t.dependencyIds ?? []),
  );

  for (const t of live) {
    // 1. Past due -> overdue (warning)
    if ((t.status === 'active' || t.status === 'in_progress') && t.dueDate < today) {
      await markOverdue(t);
      t.status = 'overdue';
      summary.overdue += 1;
      count(
        await raise({
          employeeId: t.employeeId,
          planId: t.planId,
          taskId: t.id,
          type: 'task_overdue',
          severity: 'warning',
          message: `"${t.title}" for ${t.employeeName} is overdue (due ${t.dueDate})`,
        }),
      );
    }

    // 2. Overdue blocker -> escalated (critical)
    if (t.status === 'overdue' && openDependedOn.has(t.id)) {
      await markEscalated(t);
      t.status = 'escalated';
      summary.blockers += 1;
      count(
        await raise({
          employeeId: t.employeeId,
          planId: t.planId,
          taskId: t.id,
          type: 'blocker_overdue',
          severity: 'critical',
          message: `"${t.title}" for ${t.employeeName} is overdue and other tasks are waiting on it`,
        }),
      );
    }

    // 4. Background check more than 48h overdue -> HR
    if (t.status !== 'completed' && BACKGROUND_CHECK.test(t.title) && daysBetween(t.dueDate, today) >= 2) {
      summary.backgroundCheck += 1;
      count(
        await raise({
          employeeId: t.employeeId,
          planId: t.planId,
          taskId: t.id,
          type: 'background_check_overdue',
          severity: 'critical',
          message: `Background check for ${t.employeeName} is more than 48h overdue`,
        }),
      );
    }
  }

  // 3. Low-confidence content awaiting review (drafts)
  for (const row of await listUnconfirmedLowConfidence()) {
    summary.lowConfidence += 1;
    count(await raiseLowConfidence(row));
  }
  const lowPlans = await db
    .select()
    .from(onboardingPlans)
    .where(and(eq(onboardingPlans.status, 'draft'), lt(onboardingPlans.aiConfidence, 0.3)));
  for (const plan of lowPlans) {
    summary.lowConfidence += 1;
    count(
      await raise({
        employeeId: plan.employeeId,
        planId: plan.id,
        type: 'low_confidence_plan',
        severity: 'critical',
        message: `Draft plan v${plan.version} has overall AI confidence ${plan.aiConfidence.toFixed(2)} and awaits review`,
      }),
    );
  }

  // 5. Start date < 5 days away with > 30% incomplete
  const plans = new Map();
  for (const t of live) {
    const p = plans.get(t.planId) ?? { total: 0, done: 0, t };
    p.total += 1;
    if (t.status === 'completed') p.done += 1;
    plans.set(t.planId, p);
  }
  for (const [planId, p] of plans) {
    const daysToStart = daysBetween(today, p.t.employeeStartDate);
    const incomplete = (p.total - p.done) / p.total;
    if (daysToStart >= 0 && daysToStart < 5 && incomplete > 0.3) {
      summary.startUrgency += 1;
      count(
        await raise({
          employeeId: p.t.employeeId,
          planId,
          type: 'start_date_urgency',
          severity: 'critical',
          message: `${p.t.employeeName} starts in ${daysToStart} day(s) and ${Math.round(incomplete * 100)}% of onboarding tasks are incomplete`,
        }),
      );
    }
  }

  logger.info(summary, 'escalation scan finished');
  return summary;
}

/** Fire-and-forget scan used after task updates; never throws into the request. */
export function scanSoon() {
  runScan().catch((err) => logger.error({ err }, 'background escalation scan failed'));
}
