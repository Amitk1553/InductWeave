import { env } from '../config/env.js';
import { auditLogger, AUDIT_EVENTS } from './auditLogger.js';
import { buildRuleDrafts } from '../services/taskGenerator.service.js';
import { raise } from '../services/escalation.service.js';

export const FALLBACK_BANNER = 'Template Plan (AI unavailable). Needs extra review';

/**
 * Rules-engine-only plan used when Gemini times out, errors, hits quota or returns unusable output.
 * Logs the failure; persisting the plan and raising the notice happen in recordFallbackPlan once a plan id exists.
 */
export async function generateFallbackPlan(employee, cause) {
  const reason = cause?.reason ?? cause?.message ?? 'Unknown AI failure';
  await auditLogger.log({
    eventType: AUDIT_EVENTS.AI_CHECKLIST_FAILED,
    employeeId: employee.id ?? null,
    actor: 'ai',
    details: `AI checklist generation failed: ${reason}`,
    metadata: {
      llm_model: env.GEMINI_MODEL,
      prompt_version: env.PROMPT_VERSION,
      reason,
      rejected_tasks: (cause?.rejected ?? []).slice(0, 20),
    },
  });
  return { drafts: buildRuleDrafts(employee, { fallback: true }), reason, banner: FALLBACK_BANNER };
}

export async function recordFallbackPlan({ plan, employee, reason, tasksCreated }) {
  await auditLogger.log({
    eventType: AUDIT_EVENTS.FALLBACK_PLAN_GENERATED,
    employeeId: employee.id,
    actor: 'system',
    details: `${FALLBACK_BANNER} (v${plan.version})`,
    metadata: { plan_id: plan.id, reason, tasks_generated: tasksCreated },
  });
  await raise({
    employeeId: employee.id,
    planId: plan.id,
    type: 'llm_failure',
    severity: 'warning',
    message: `AI generation failed for ${employee.name}; a template plan was created and needs extra review (${reason})`,
  });
}

export const fallbackHandler = { generateFallbackPlan, recordFallbackPlan };
