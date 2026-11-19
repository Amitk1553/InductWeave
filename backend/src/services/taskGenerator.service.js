import { generateChecklist } from '../ai/checklistGenerator.js';
import { addDays, todayStr } from '../lib/dates.js';
import { getRequiredTasks, getTemplates } from './rulesEngine.service.js';

// Anything that looks like tax/identity/screening paperwork always needs a human check.
const LEGAL_PATTERN =
  /\b(tax|w-?4|i-?9|td1|ssn|social (security|insurance)|background (check|verification)|right[- ]to[- ]work|p45|national insurance|pan card|aadhaar|work authori[sz]ation|visa)\b/i;

const normTitle = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const round2 = (n) => Math.round(n * 100) / 100;
const join = (...parts) => parts.filter(Boolean).join('; ') || null;

function toDraft(t, overrides = {}) {
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
    confidence: t.confidence,
    requiresReview: t.requires_review,
    reviewReason: t.review_reason,
    policyReference: t.policy_reference ?? null,
    source: 'rule',
    legal: t.legal,
    ...overrides,
  };
}

/** Deterministic drafts straight from the rules engine; `fallback` marks them as an unreviewed template plan. */
export function buildRuleDrafts(employee, { fallback = false } = {}) {
  return getRequiredTasks(employee).map((t) =>
    toDraft(
      t,
      fallback
        ? {
            confidence: Math.min(t.confidence, 0.6),
            requiresReview: true,
            reviewReason: join('Template plan: AI unavailable', t.review_reason),
          }
        : {},
    ),
  );
}

/**
 * Rule tasks are authoritative. AI output can only enrich descriptions/citations of matching
 * tasks or add contextual extras; it can never remove or reschedule a mandatory task.
 */
export function mergeAiTasks(ruleDrafts, aiTasks) {
  const merged = ruleDrafts.map((d) => ({ ...d }));
  const byTemplate = new Map(merged.map((d) => [d.templateId, d]));
  const byTitle = new Map(merged.map((d) => [normTitle(d.title), d]));
  const templateIds = new Set(getTemplates().map((t) => t.id));
  const templatesById = new Map(getTemplates().map((t) => [t.id, t]));
  const seenExtra = new Set();
  let extraIndex = 0;

  for (const ai of aiTasks) {
    const match = (ai.template_id && byTemplate.get(ai.template_id)) || byTitle.get(normTitle(ai.title));
    if (match) {
      match.description = ai.description || match.description;
      match.policyReference = ai.policy_reference ?? match.policyReference;
      match.confidence = round2((match.confidence + ai.confidence) / 2);
      if (match.confidence < 0.5 && !match.requiresReview) {
        match.requiresReview = true;
        match.reviewReason = `Low AI confidence (${match.confidence})`;
      }
      continue;
    }

    const key = normTitle(ai.title);
    if (seenExtra.has(key)) continue;
    seenExtra.add(key);

    const tpl = ai.template_id && templateIds.has(ai.template_id) ? templatesById.get(ai.template_id) : null;
    const legal = Boolean(tpl?.legal) || LEGAL_PATTERN.test(`${ai.title} ${ai.description}`);
    const reasons = [];
    if (ai.confidence < 0.5) reasons.push(`Low AI confidence (${ai.confidence})`);
    if (legal) reasons.push('Legal/compliance task: HR must verify');
    if (ai.dateInPast) reasons.push('Due date falls in the past');

    extraIndex += 1;
    merged.push({
      ref: `ai-${extraIndex}`,
      templateId: tpl?.id ?? null,
      title: ai.title,
      description: ai.description,
      category: ai.category,
      assignedToRole: ai.assigned_to_role,
      priority: ai.priority,
      dueOffsetDays: ai.due_date_offset_days,
      dependsOn: [],
      confidence: ai.confidence,
      requiresReview: reasons.length > 0,
      reviewReason: reasons.join('; ') || null,
      policyReference: ai.policy_reference,
      source: 'ai',
      legal,
    });
  }

  return merged.sort((a, b) => a.dueOffsetDays - b.dueOffsetDays || a.priority - b.priority);
}

/** Full AI pipeline: rules + RAG + Gemini + guardrails + merge. Throws AiGenerationError on failure. */
export async function generateAiDrafts(employee, opts = {}) {
  const ruleDrafts = buildRuleDrafts(employee);
  const result = await generateChecklist(employee, opts);
  const drafts = mergeAiTasks(ruleDrafts, result.tasks);
  return { drafts, ai: result };
}

/**
 * Turns drafts into task rows. Due dates that already passed (e.g. a past or imminent start date)
 * are moved to today and flagged so HR can see the plan was adjusted.
 */
export function materializeDrafts(drafts, employee, ids) {
  const today = todayStr();
  const idByRef = new Map(drafts.map((d, i) => [d.ref, ids[i]]));

  return drafts.map((d, i) => {
    let dueDate = addDays(employee.startDate, d.dueOffsetDays);
    let { requiresReview, reviewReason } = d;
    if (dueDate < today) {
      dueDate = today;
      requiresReview = true;
      reviewReason = join(reviewReason, 'Due date moved to today: it had already passed when the plan was generated');
    }
    const forced = d.legal && !requiresReview;
    return {
      id: ids[i],
      templateId: d.templateId,
      title: d.title,
      description: d.description,
      category: d.category,
      assignedToRole: d.assignedToRole,
      assignedToName:
        d.assignedToRole === 'employee' ? employee.name : d.assignedToRole === 'manager' ? employee.managerName : null,
      status: 'pending',
      priority: d.priority,
      dueDate,
      dependencyIds: d.dependsOn.map((ref) => idByRef.get(ref)).filter(Boolean),
      confidence: d.confidence,
      requiresReview: requiresReview || forced,
      reviewReason: forced ? 'Legal/compliance task: HR must verify' : reviewReason,
      policyReference: d.policyReference,
      source: d.source,
    };
  });
}
