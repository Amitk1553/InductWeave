import { aiChecklistRootSchema, aiTaskSchema, chatAnswerSchema } from '../schemas/aiOutput.schema.js';
import { addDays, todayStr } from '../lib/dates.js';

const MAX_INVALID_RATIO = 0.3;
const PRE_START_WORDS = /\bbefore (the )?(start|first day|joining|day one|day 1)\b/i;

/** Parses model output, tolerating stray markdown fences or surrounding prose. */
export function parseJsonLoose(raw) {
  if (raw !== null && typeof raw === 'object') return raw;
  let text = String(raw ?? '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('Response is not valid JSON');
    return JSON.parse(text.slice(start, end + 1));
  }
}

const issueText = (error) => error.issues.map((i) => `${i.path.join('.') || 'task'}: ${i.message}`).join('; ');

/**
 * Validates a raw checklist response.
 * Output: { valid, tasks, rejected: [{ task, reason }], overallConfidence, error? }
 * Individual bad tasks are dropped; the response as a whole is invalid when the root is
 * malformed, nothing survives, or more than 30% of the tasks were rejected.
 */
export function validateAiOutput(raw, { startDate, today = todayStr() } = {}) {
  const fail = (error, rejected = []) => ({ valid: false, tasks: [], rejected, overallConfidence: null, error });

  let parsed;
  try {
    parsed = parseJsonLoose(raw);
  } catch (err) {
    return fail(err.message);
  }

  const root = aiChecklistRootSchema.safeParse(parsed);
  if (!root.success) return fail(`Root structure invalid: ${issueText(root.error)}`);
  if (root.data.tasks.length === 0) return fail('Response contained no tasks');

  const tasks = [];
  const rejected = [];

  for (const candidate of root.data.tasks) {
    const result = aiTaskSchema.safeParse(candidate);
    if (!result.success) {
      rejected.push({ task: candidate, reason: issueText(result.error) });
      continue;
    }
    const task = result.data;

    if (task.due_date_offset_days >= 0 && PRE_START_WORDS.test(`${task.title} ${task.description}`)) {
      rejected.push({ task: candidate, reason: 'Pre-start task has a due date on/after the start date' });
      continue;
    }

    const dueDate = startDate ? addDays(startDate, task.due_date_offset_days) : null;
    tasks.push({ ...task, dateInPast: Boolean(dueDate && dueDate < today) });
  }

  const total = root.data.tasks.length;
  if (tasks.length === 0) return fail('All tasks were rejected by guardrails', rejected);
  if (rejected.length / total > MAX_INVALID_RATIO) {
    return fail(`${rejected.length}/${total} tasks rejected (limit ${MAX_INVALID_RATIO * 100}%)`, rejected);
  }

  const overallConfidence = tasks.reduce((s, t) => s + t.confidence, 0) / tasks.length;
  return { valid: true, tasks, rejected, overallConfidence };
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Validates a chat answer and drops citations that do not match a retrieved chunk.
 * Output: { valid, answer, citations, droppedCitations, confidence, error? }
 */
export function validateChatOutput(raw, chunks) {
  let parsed;
  try {
    parsed = parseJsonLoose(raw);
  } catch (err) {
    return { valid: false, error: err.message };
  }
  const result = chatAnswerSchema.safeParse(parsed);
  if (!result.success) return { valid: false, error: issueText(result.error) };

  const citations = [];
  let droppedCitations = 0;
  for (const c of result.data.citations) {
    const chunk = chunks.find(
      (k) =>
        norm(k.doc_name) === norm(c.doc_name) &&
        (norm(k.section) === norm(c.section) || norm(k.section).includes(norm(c.section)) || norm(c.section).includes(norm(k.section))),
    );
    if (!chunk) {
      droppedCitations += 1;
      continue;
    }
    citations.push({
      doc_name: chunk.doc_name,
      section: chunk.section,
      quote: c.quote.slice(0, 200),
    });
  }

  return { valid: true, answer: result.data.answer, citations, droppedCitations, confidence: result.data.confidence };
}
