import { insertAudit } from '../db/queries/audit.js';
import { logger } from '../config/logger.js';

export const AUDIT_EVENTS = Object.freeze({
  EMPLOYEE_CREATED: 'employee_created',
  AI_CHECKLIST_GENERATED: 'ai_checklist_generated',
  AI_CHECKLIST_FAILED: 'ai_checklist_failed',
  FALLBACK_PLAN_GENERATED: 'fallback_plan_generated',
  PLAN_APPROVED: 'plan_approved',
  PLAN_REJECTED: 'plan_rejected',
  TASK_ADDED: 'task_added',
  TASK_MODIFIED: 'task_modified',
  TASK_DELETED: 'task_deleted',
  TASK_STATUS_CHANGED: 'task_status_changed',
  CHAT_QUERY: 'chat_query',
  CHAT_UNANSWERED: 'chat_unanswered',
  PROMPT_INJECTION_SUSPECTED: 'prompt_injection_suspected',
  ESCALATION_RAISED: 'escalation_raised',
  ESCALATION_RESOLVED: 'escalation_resolved',
});

/** Best-effort: an audit write failure is logged loudly but never breaks the user flow. */
export async function log({ eventType, employeeId = null, actor = 'system', details = '', metadata = null }) {
  try {
    return await insertAudit({ eventType, employeeId, actor, details, metadata });
  } catch (err) {
    logger.error({ err, eventType, employeeId }, 'failed to write audit event');
    return null;
  }
}

export const auditLogger = { log };
