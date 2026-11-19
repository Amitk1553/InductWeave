import { env } from '../config/env.js';
import { AiGenerationError } from '../ai/checklistGenerator.js';
import { generateFallbackPlan, recordFallbackPlan, FALLBACK_BANNER } from '../harness/fallbackHandler.js';
import { auditLogger, AUDIT_EVENTS } from '../harness/auditLogger.js';
import { getEmployeeById, updateEmployee } from '../db/queries/employees.js';
import {
  createPlan,
  getLatestPlanForEmployee,
  getPlanById,
  getPlanProgress,
  listPlansForEmployee,
  supersedeDrafts,
  updatePlan,
} from '../db/queries/plans.js';
import { insertTasks, listTasksByPlan, reserveTaskIds } from '../db/queries/tasks.js';
import { conflict, notFound } from '../lib/errors.js';
import { checkCompliance, missingAsDrafts } from './complianceChecker.service.js';
import {
  annotateBlocked,
  applyInitialStates,
  DependencyCycleError,
  tasksToNodes,
  validateGraph,
} from './dependencyResolver.service.js';
import { raiseLowConfidence } from './escalation.service.js';
import { generateAiDrafts, materializeDrafts } from './taskGenerator.service.js';

const LIVE_PLAN_STATUSES = ['approved', 'in_progress', 'completed'];
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/**
 * Creates a new draft plan version for an employee: AI first, rules-only fallback on failure.
 * `simulate` ('failure' | 'malformed') is a demo/eval hook, ignored in production by the route layer.
 */
export async function generatePlan(employeeId, { actor = 'system', simulate = null } = {}) {
  const employee = await getEmployeeById(employeeId);
  if (!employee) throw notFound('Employee not found');

  const latest = await getLatestPlanForEmployee(employeeId);
  if (latest && LIVE_PLAN_STATUSES.includes(latest.status)) {
    throw conflict(`Employee already has a ${latest.status.replace('_', ' ')} plan; it cannot be regenerated`);
  }

  let mode = 'ai';
  let drafts;
  let ai = null;
  let failure = null;

  try {
    ({ drafts, ai } = await generateAiDrafts(employee, { simulate }));
  } catch (err) {
    if (!(err instanceof AiGenerationError)) throw err;
    failure = err;
  }

  if (failure) {
    mode = 'fallback';
    ({ drafts } = await generateFallbackPlan(employee, failure));
  }

  // The rules engine is the source of truth for mandatory tasks; add anything still missing.
  const compliance = checkCompliance({ tasks: drafts }, employee);
  if (compliance.missing.length) drafts = [...drafts, ...missingAsDrafts(compliance.missing, employee)];

  validateGraph(drafts.map((d) => ({ id: d.ref, title: d.title, dependsOn: d.dependsOn })));

  const plan = await createPlan({
    employeeId,
    status: 'draft',
    generationMode: mode,
    aiConfidence: mean(drafts.map((d) => d.confidence)),
    aiRawResponse: ai
      ? { text: ai.rawResponse, retried: ai.retried, rejected: ai.rejected, usage: ai.usage }
      : { error: failure.reason, rejected: failure.rejected, text: failure.rawResponse },
    complianceScore: compliance.score,
    complianceMissing: compliance.missing,
    notes: mode === 'fallback' ? FALLBACK_BANNER : null,
  });

  const ids = await reserveTaskIds(drafts.length);
  const rows = materializeDrafts(drafts, employee, ids).map((r) => ({ ...r, planId: plan.id }));
  await insertTasks(rows);
  await supersedeDrafts(employeeId, plan.id);

  const flagged = rows.filter((r) => r.requiresReview).length;

  if (mode === 'ai') {
    await auditLogger.log({
      eventType: AUDIT_EVENTS.AI_CHECKLIST_GENERATED,
      employeeId,
      actor: 'ai',
      details: `AI generated draft plan v${plan.version} with ${rows.length} tasks`,
      metadata: {
        plan_id: plan.id,
        llm_model: env.GEMINI_MODEL,
        prompt_version: env.PROMPT_VERSION,
        tokens_used: (ai.usage.tokensIn ?? 0) + (ai.usage.tokensOut ?? 0),
        latency_ms: ai.usage.latencyMs,
        overall_confidence: plan.aiConfidence,
        tasks_generated: rows.length,
        tasks_flagged: flagged,
        policies_retrieved: ai.chunks.map((c) => `${c.doc_name} — ${c.section}`),
        rejected_tasks: ai.rejected.slice(0, 20),
        retried: ai.retried,
        compliance_score: compliance.score,
      },
    });
  } else {
    await recordFallbackPlan({ plan, employee, reason: failure.reason, tasksCreated: rows.length });
  }

  const lowConfidence = rows.filter((r) => r.requiresReview && r.confidence < 0.3).length;
  if (lowConfidence) await raiseLowConfidence({ planId: plan.id, employeeId, count: lowConfidence });

  return { plan, tasksCreated: rows.length, mode, actor };
}

export async function getPlanDetail(planId) {
  const plan = await getPlanById(planId);
  if (!plan) throw notFound('Plan not found');
  const [employee, rows, progress, versions] = await Promise.all([
    getEmployeeById(plan.employeeId),
    listTasksByPlan(planId),
    getPlanProgress(planId),
    listPlansForEmployee(plan.employeeId),
  ]);
  const tasks = await annotateBlocked(rows);
  const compliance = checkCompliance({ tasks: rows }, employee);
  const pendingConfirmation = rows.filter((t) => t.requiresReview && t.confidence < 0.3 && !t.reviewConfirmed);

  return {
    plan,
    employee,
    tasks,
    progress,
    versions,
    compliance,
    banner: plan.generationMode === 'fallback' ? FALLBACK_BANNER : null,
    approvalBlockers: pendingConfirmation.map((t) => ({ id: t.id, title: t.title, confidence: t.confidence })),
  };
}

export async function approvePlan(planId, user) {
  const plan = await getPlanById(planId);
  if (!plan) throw notFound('Plan not found');
  if (plan.status !== 'draft') throw conflict(`Only draft plans can be approved (this plan is ${plan.status})`);

  const rows = await listTasksByPlan(planId);
  const unconfirmed = rows.filter((t) => t.requiresReview && t.confidence < 0.3 && !t.reviewConfirmed);
  if (unconfirmed.length) {
    throw conflict('Low-confidence tasks must be explicitly confirmed before approval', {
      tasks: unconfirmed.map((t) => ({ id: t.id, title: t.title, confidence: t.confidence })),
    });
  }

  try {
    validateGraph(tasksToNodes(rows));
  } catch (err) {
    if (err instanceof DependencyCycleError) throw conflict(err.message, { cycle: err.cycle });
    throw err;
  }

  const approved = await updatePlan(planId, { status: 'approved', approvedBy: user.id, approvedAt: new Date() });
  await updateEmployee(plan.employeeId, { status: 'onboarding' });
  const states = await applyInitialStates(planId);

  await auditLogger.log({
    eventType: AUDIT_EVENTS.PLAN_APPROVED,
    employeeId: plan.employeeId,
    actor: user.id,
    details: `Plan v${plan.version} approved; ${states.activated} task(s) activated, ${states.pending} waiting on dependencies`,
    metadata: { plan_id: planId, version: plan.version, generation_mode: plan.generationMode, ...states },
  });
  return approved;
}

export async function rejectPlan(planId, reason, user) {
  const plan = await getPlanById(planId);
  if (!plan) throw notFound('Plan not found');
  if (plan.status !== 'draft') throw conflict(`Only draft plans can be rejected (this plan is ${plan.status})`);

  const rejected = await updatePlan(planId, { status: 'rejected', notes: reason });
  await auditLogger.log({
    eventType: AUDIT_EVENTS.PLAN_REJECTED,
    employeeId: plan.employeeId,
    actor: user.id,
    details: `Plan v${plan.version} rejected: ${reason}`,
    metadata: { plan_id: planId, reason },
  });
  return rejected;
}
