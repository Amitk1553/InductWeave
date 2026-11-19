import { getRequiredTasks } from './rulesEngine.service.js';

/**
 * Compares a plan (rows or drafts exposing `templateId`) against the rules engine's mandatory list.
 * Returns { score: 0..1, missing: [{ templateId, title, legal }] }.
 */
export function checkCompliance(plan, employee) {
  const required = getRequiredTasks(employee).filter((t) => t.mandatory);
  const present = new Set(plan.tasks.map((t) => t.templateId).filter(Boolean));
  const missing = required
    .filter((t) => !present.has(t.id))
    .map((t) => ({ templateId: t.id, title: t.title, legal: t.legal }));
  const score = required.length ? (required.length - missing.length) / required.length : 1;
  return { score: Math.round(score * 1000) / 1000, missing, requiredCount: required.length };
}

/** Draft form of the mandatory tasks that are absent, flagged for review. */
export function missingAsDrafts(missing, employee) {
  const byId = new Map(getRequiredTasks(employee).map((t) => [t.id, t]));
  return missing.map(({ templateId }) => {
    const t = byId.get(templateId);
    return {
      ref: t.id,
      templateId: t.id,
      title: t.title,
      description: t.description,
      category: t.category,
      assignedToRole: t.assigned_to_role,
      priority: t.priority,
      dueOffsetDays: t.due_offset_days,
      dependsOn: t.depends_on,
      confidence: 0.8,
      requiresReview: true,
      reviewReason: 'Mandatory task auto-added by compliance check',
      policyReference: t.policy_reference ?? null,
      source: 'rule',
      legal: t.legal,
    };
  });
}
