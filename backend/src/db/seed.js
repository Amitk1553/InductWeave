/* Seed script: populates realistic demo data without calling Gemini. Idempotent (truncates, then re-seeds). */
import { sql } from 'drizzle-orm';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { addDays, todayStr } from '../lib/dates.js';
import { closeDb, db } from './client.js';
import { auditLog, chatMessages, employees, escalations, llmMetrics, onboardingPlans, tasks } from './schema.js';
import { reserveTaskIds } from './queries/tasks.js';
import { getRequiredTasks } from '../services/rulesEngine.service.js';

if (env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  logger.error('Refusing to truncate and seed a production database. Re-run with --force if you are sure.');
  process.exit(1);
}

const started = Date.now();
const TODAY = todayStr();
const NOW = Date.now();
const DAY = 86_400_000;
const DEMO_EMAIL = (process.env.SEED_DEMO_EMAIL ?? '').trim().toLowerCase() || null;

// Deterministic PRNG so every run produces the same story.
let seedState = 20260101;
function rnd() {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rint = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const at = (dateStr, hour = 10) => new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00Z`);
const daysAgo = (n, hour = 10) => new Date(NOW - n * DAY + (hour - 12) * 3_600_000);

const LOCATIONS = ['Bangalore', 'Mumbai', 'New York', 'London', 'Toronto'];
const NAMES = {
  Bangalore: ['Aarav Mehta', 'Ananya Iyer', 'Rohan Gupta', 'Kavya Reddy', 'Vikram Rao', 'Sneha Pillai', 'Arjun Nair', 'Divya Krishnan', 'Karthik Subramanian', 'Pooja Hegde'],
  Mumbai: ['Rahul Deshmukh', 'Isha Kulkarni', 'Siddharth Joshi', 'Neha Shah', 'Aditya Malhotra', 'Riya Kapoor', 'Manish Patil', 'Tanvi Bhatt', 'Nikhil Chawla', 'Shruti Menon'],
  'New York': ['Emily Carter', 'Michael Thompson', 'Jessica Martinez', 'Daniel Brooks', 'Olivia Bennett', 'Ryan Foster', 'Sophia Nguyen', 'Jacob Rivera', 'Hannah Wallace', 'Ethan Cole'],
  London: ['Oliver Hughes', 'Amelia Clarke', 'Harry Edwards', 'Charlotte Wright', 'George Harrison', 'Isla Patel', 'Jack Robinson', 'Freya Morgan', 'Thomas Bell', 'Grace Turner'],
  Toronto: ['Liam Tremblay', 'Chloe Gagnon', 'Noah Campbell', 'Mia Roy', 'Lucas Fraser', 'Emma Lavoie', 'Benjamin Chen', 'Ava Singh', 'Nathan MacDonald', 'Zoe Bouchard'],
};
const ROLES = [
  { role: 'Software Engineer', depts: ['Engineering', 'Product'] },
  { role: 'Senior Software Engineer', depts: ['Engineering'] },
  { role: 'Engineering Manager', depts: ['Engineering'] },
  { role: 'Sales Representative', depts: ['Sales', 'Operations'] },
  { role: 'Account Executive', depts: ['Sales'] },
  { role: 'Product Designer', depts: ['Design', 'Product'] },
  { role: 'HR Specialist', depts: ['HR'] },
  { role: 'Financial Analyst', depts: ['Finance'] },
  { role: 'Marketing Specialist', depts: ['Marketing', 'Operations'] },
  { role: 'Marketing Intern', depts: ['Marketing'] },
];
const MANAGERS = [
  { name: 'Meera Nair', email: DEMO_EMAIL ?? 'meera.nair@company.example' },
  { name: 'Jonathan Price', email: 'jonathan.price@company.example' },
  { name: 'Priyanka Verma', email: 'priyanka.verma@company.example' },
  { name: 'Sarah Whitfield', email: 'sarah.whitfield@company.example' },
  { name: 'David Okafor', email: 'david.okafor@company.example' },
];
const AI_EXTRAS = [
  { title: 'Join team welcome lunch', description: 'Meet the immediate team informally during the first week.', category: 'introductions', role: 'employee', offset: 2, ref: 'global_onboarding.md — First Week Schedule and Buddy Program' },
  { title: 'Review company handbook', description: 'Read the employee handbook and note questions for your buddy.', category: 'training', role: 'employee', offset: 3, ref: 'global_onboarding.md — Day One Checklist' },
  { title: 'Enroll in health insurance', description: 'Select a health insurance plan in the benefits portal within 30 days of joining.', category: 'documents', role: 'employee', offset: 14, ref: 'global_onboarding.md — Health Insurance Enrollment' },
];

// ---- 1. People ----------------------------------------------------------------------------

const slots = [];
const addSlots = (kind, n) => {
  for (let i = 0; i < n; i += 1) slots.push({ kind });
};
addSlots('completed', 27);
addSlots('progress', 13);
addSlots('overdue', 5);
addSlots('draft', 3);
addSlots('pendingStart', 2);

const usedEmails = new Set();
const people = slots.map((slot, i) => {
  const location = LOCATIONS[i % LOCATIONS.length];
  const name = NAMES[location][Math.floor(i / LOCATIONS.length) % NAMES[location].length];
  const spec = pick(ROLES);
  let email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@company.example`;
  if (usedEmails.has(email)) email = email.replace('@', `${i}@`);
  usedEmails.add(email);
  const manager = MANAGERS[i % MANAGERS.length];
  return { ...slot, name, email, location, role: spec.role, department: pick(spec.depts), manager };
});

// Story-driven overrides so the demo has recognisable cases.
const bySlot = (kind) => people.filter((p) => p.kind === kind);
Object.assign(bySlot('overdue')[0], { role: 'Software Engineer', department: 'Engineering', location: 'Bangalore', name: 'Rahul Verma', email: 'rahul.verma@company.example', story: 'blocker', overdue: ['bgv_in', 'pan_card'] });
Object.assign(bySlot('overdue')[1], { role: 'Sales Representative', department: 'Sales', location: 'New York', name: 'Madison Reed', email: 'madison.reed@company.example', overdue: ['i9', 'direct_deposit'] });
Object.assign(bySlot('overdue')[2], { role: 'Marketing Specialist', department: 'Marketing', location: 'London', name: 'Callum Reid', email: 'callum.reid@company.example', overdue: ['laptop'] });
Object.assign(bySlot('overdue')[3], { role: 'Financial Analyst', department: 'Finance', location: 'Mumbai', name: 'Sanjana Rao', email: 'sanjana.rao@company.example', overdue: ['security_training', 'aadhaar'] });
Object.assign(bySlot('overdue')[4], { role: 'Account Executive', department: 'Sales', location: 'Toronto', name: 'Ethan Roy', email: 'ethan.roy@company.example', overdue: ['sin'] });
Object.assign(bySlot('draft')[0], { role: 'Software Engineer', department: 'Engineering', location: 'Bangalore', name: 'Tanmay Joshi', email: 'tanmay.joshi@company.example', story: 'lowConfidence' });
Object.assign(bySlot('draft')[1], { role: 'Chief Vibes Officer', department: 'Operations', location: 'London', name: 'Willow Harper', email: 'willow.harper@company.example', story: 'fallback' });
Object.assign(bySlot('draft')[2], { role: 'Product Designer', department: 'Design', location: 'Toronto', name: 'Sasha Lee', email: 'sasha.lee@company.example', story: 'normalDraft' });
if (DEMO_EMAIL) {
  Object.assign(bySlot('progress')[0], { role: 'Software Engineer', department: 'Engineering', location: 'Bangalore', name: 'Demo Employee', email: DEMO_EMAIL, story: 'demoEmployee' });
}
// Two completed hires were generated by the fallback path, so the fallback metric is non-zero.
bySlot('completed')[3].story = 'fallback';
bySlot('completed')[11].story = 'fallback';
// The demo manager (Meera Nair / SEED_DEMO_EMAIL) has a recognisable team.
people.forEach((p, i) => {
  if (i % 4 === 0) p.manager = MANAGERS[0];
});

function startFor(kind) {
  switch (kind) {
    case 'completed': return addDays(TODAY, -rint(35, 140));
    case 'progress': return addDays(TODAY, rint(-6, 3));
    case 'overdue': return addDays(TODAY, -rint(6, 15));
    case 'draft': return addDays(TODAY, rint(7, 21));
    default: return addDays(TODAY, rint(3, 5));
  }
}
people.forEach((p) => {
  p.startDate = startFor(p.kind);
});

// ---- 2. Tasks per person -------------------------------------------------------------------

function buildTasks(person) {
  const base = getRequiredTasks(person).map((t) => ({
    templateId: t.id,
    title: t.title,
    description: t.description,
    category: t.category,
    assignedToRole: t.assigned_to_role,
    priority: t.priority,
    dueDate: addDays(person.startDate, t.due_offset_days),
    dependsOn: t.depends_on,
    confidence: person.story === 'fallback' ? 0.6 : 1,
    requiresReview: t.requires_review || person.story === 'fallback',
    reviewReason: person.story === 'fallback' ? 'Template plan: AI unavailable' : t.review_reason,
    policyReference: t.policy_reference ?? null,
    source: 'rule',
    hrModified: false,
  }));

  const extras = [];
  if (person.story !== 'fallback') {
    const chosen =
      person.story === 'lowConfidence'
        ? AI_EXTRAS
        : [AI_EXTRAS[rint(0, 1)], ...(person.kind === 'completed' ? [] : [AI_EXTRAS[2]])];
    chosen.forEach((e, i) => {
      let confidence = Math.round((0.6 + rnd() * 0.35) * 100) / 100;
      let reviewReason = null;
      if (person.story === 'lowConfidence') {
        confidence = [0.25, 0.42, 0.7][i];
        reviewReason = confidence < 0.5 ? `Low AI confidence (${confidence})` : null;
      }
      extras.push({
        templateId: null,
        title: person.story === 'lowConfidence' && i === 0 ? 'Request access to legacy billing system' : e.title,
        description: person.story === 'lowConfidence' && i === 0 ? 'The model suggested legacy billing access but the policies do not mention it.' : e.description,
        category: e.category,
        assignedToRole: e.role,
        priority: 3,
        dueDate: addDays(person.startDate, e.offset),
        dependsOn: [],
        confidence,
        requiresReview: confidence < 0.5,
        reviewReason,
        policyReference: person.story === 'lowConfidence' && i === 0 ? null : e.ref,
        source: 'ai',
        hrModified: person.kind !== 'draft' && rnd() < 0.3,
      });
    });
  }
  return [...base, ...extras].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.priority - b.priority);
}

function assignStatuses(person, rows) {
  const done = new Set();
  const status = new Map();
  const dependents = new Map();
  for (const r of rows) for (const d of r.dependsOn) (dependents.get(d) ?? dependents.set(d, []).get(d)).push(r.templateId);

  // Everything downstream of a deliberately overdue task stays pending.
  const blocked = new Set();
  const markBlocked = (id) => {
    for (const next of dependents.get(id) ?? []) {
      if (!blocked.has(next)) {
        blocked.add(next);
        markBlocked(next);
      }
    }
  };
  const overdueIds = new Set(person.overdue ?? []);
  overdueIds.forEach(markBlocked);

  for (const r of rows) {
    const key = r.templateId ?? r.title;
    const depsDone = r.dependsOn.every((d) => done.has(d));
    const pastDue = r.dueDate < TODAY;

    if (person.kind === 'draft') {
      status.set(key, 'pending');
    } else if (overdueIds.has(r.templateId) && pastDue) {
      status.set(key, 'overdue');
    } else if (blocked.has(r.templateId) || !depsDone) {
      status.set(key, 'pending');
    } else if (person.kind === 'completed' || pastDue || (r.dueDate <= addDays(TODAY, 1) && rnd() < 0.4)) {
      status.set(key, 'completed');
      done.add(r.templateId ?? key);
    } else {
      status.set(key, rnd() < 0.25 ? 'in_progress' : 'active');
    }
  }

  // A task that is overdue and has unfinished dependents is the blocker: escalate it.
  for (const r of rows) {
    const key = r.templateId ?? r.title;
    if (status.get(key) === 'overdue' && (dependents.get(r.templateId) ?? []).length && person.story === 'blocker') {
      status.set(key, 'escalated');
    }
  }
  return rows.map((r) => ({ ...r, status: status.get(r.templateId ?? r.title) }));
}

// ---- 3. Build all rows in memory ----------------------------------------------------------

const plans = [];
const allTasks = [];

for (const p of people) {
  const rows = assignStatuses(p, buildTasks(p));
  const anyDone = rows.some((r) => r.status === 'completed');
  const allDone = rows.every((r) => r.status === 'completed');
  p.planStatus = p.kind === 'draft' ? 'draft' : allDone ? 'completed' : anyDone ? 'in_progress' : 'approved';
  p.employeeStatus = p.kind === 'draft' ? 'pending' : allDone ? 'completed' : 'onboarding';
  p.rows = rows;
  p.mode = p.story === 'fallback' ? 'fallback' : 'ai';
  p.createdAt = at(addDays(p.startDate, -(p.kind === 'completed' ? 14 : 10)), 9);
  p.approvedAt = p.kind === 'draft' ? null : at(addDays(p.startDate, p.kind === 'completed' ? -12 : -8), 14);
  p.confidence = rows.reduce((s, r) => s + r.confidence, 0) / rows.length;
}

// ---- 4. Write ------------------------------------------------------------------------------

const chunked = (rows, size = 400) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));

await db.execute(sql`TRUNCATE employees, onboarding_plans, tasks, chat_messages, escalations, audit_log, llm_metrics RESTART IDENTITY CASCADE`);

const empRows = await db
  .insert(employees)
  .values(
    people.map((p) => ({
      name: p.name,
      email: p.email,
      role: p.role,
      department: p.department,
      location: p.location,
      startDate: p.startDate,
      status: p.employeeStatus,
      managerName: p.manager.name,
      managerEmail: p.manager.email,
      createdAt: p.createdAt,
    })),
  )
  .returning({ id: employees.id });
people.forEach((p, i) => {
  p.id = empRows[i].id;
});

const planRows = await db
  .insert(onboardingPlans)
  .values(
    people.map((p) => ({
      employeeId: p.id,
      status: p.planStatus,
      version: 1,
      generationMode: p.mode,
      aiConfidence: p.confidence,
      aiRawResponse: p.mode === 'fallback' ? { error: 'seeded: simulated Gemini outage' } : { seeded: true },
      complianceScore: 1,
      complianceMissing: [],
      notes: p.mode === 'fallback' ? 'Template Plan (AI unavailable). Needs extra review' : null,
      approvedBy: p.approvedAt ? 'seed:hr' : null,
      approvedAt: p.approvedAt,
      createdAt: p.createdAt,
    })),
  )
  .returning({ id: onboardingPlans.id });
people.forEach((p, i) => {
  p.planId = planRows[i].id;
});

const totalTasks = people.reduce((s, p) => s + p.rows.length, 0);
const ids = await reserveTaskIds(totalTasks);
let cursor = 0;
for (const p of people) {
  const idByTemplate = new Map();
  p.rows.forEach((r, i) => {
    r.id = ids[cursor + i];
    if (r.templateId) idByTemplate.set(r.templateId, r.id);
  });
  cursor += p.rows.length;

  for (const r of p.rows) {
    let completedAt = null;
    if (r.status === 'completed') {
      const late = p.kind === 'completed' && rnd() < 0.18 ? rint(1, 3) : -rint(0, 2);
      const when = at(addDays(r.dueDate, late), rint(9, 17));
      completedAt = when.getTime() > NOW ? new Date(NOW - rint(1, 20) * 3_600_000) : when;
    }
    allTasks.push({
      id: r.id,
      planId: p.planId,
      templateId: r.templateId,
      title: r.title,
      description: r.description,
      category: r.category,
      assignedToRole: r.assignedToRole,
      assignedToName: r.assignedToRole === 'employee' ? p.name : r.assignedToRole === 'manager' ? p.manager.name : null,
      status: r.status,
      priority: r.priority,
      dueDate: r.dueDate,
      dependencyIds: r.dependsOn.map((d) => idByTemplate.get(d)).filter(Boolean),
      confidence: r.confidence,
      requiresReview: r.requiresReview,
      reviewReason: r.reviewReason,
      reviewConfirmed: false,
      policyReference: r.policyReference,
      source: r.source,
      hrModified: r.hrModified,
      completedAt,
      createdAt: p.createdAt,
    });
  }
}
for (const part of chunked(allTasks, 300)) await db.insert(tasks).values(part);

const taskOf = (person, templateId) => person.rows.find((r) => r.templateId === templateId);

// Escalations -------------------------------------------------------------------------------
const esc = [];
for (const p of people) {
  if (p.kind === 'overdue') {
    for (const tid of p.overdue) {
      const t = taskOf(p, tid);
      if (!t) continue;
      const blocker = t.status === 'escalated';
      esc.push({
        employeeId: p.id, planId: p.planId, taskId: t.id,
        type: blocker ? 'blocker_overdue' : 'task_overdue',
        severity: blocker ? 'critical' : 'warning',
        message: blocker
          ? `"${t.title}" for ${p.name} is overdue and other tasks are waiting on it`
          : `"${t.title}" for ${p.name} is overdue (due ${t.dueDate})`,
        status: 'open', createdAt: daysAgo(rint(0, 2)),
      });
      if (/background/i.test(t.title)) {
        esc.push({
          employeeId: p.id, planId: p.planId, taskId: t.id, type: 'background_check_overdue', severity: 'critical',
          message: `Background check for ${p.name} is more than 48h overdue`, status: 'open', createdAt: daysAgo(1),
        });
      }
    }
  }
  if (p.story === 'lowConfidence') {
    esc.push({ employeeId: p.id, planId: p.planId, type: 'low_confidence_review', severity: 'critical', message: '1 task(s) have AI confidence below 0.3 and need explicit HR confirmation before approval', status: 'open', createdAt: daysAgo(0) });
  }
  if (p.story === 'fallback' && p.kind === 'draft') {
    esc.push({ employeeId: p.id, planId: p.planId, type: 'llm_failure', severity: 'warning', message: `AI generation failed for ${p.name}; a template plan was created and needs extra review (quota: seeded outage)`, status: 'open', createdAt: daysAgo(0) });
  }
  if (p.kind === 'completed' && rnd() < 0.3) {
    const t = pick(p.rows);
    esc.push({ employeeId: p.id, planId: p.planId, taskId: t.id, type: 'task_overdue', severity: 'warning', message: `"${t.title}" for ${p.name} was overdue`, status: 'resolved', createdAt: daysAgo(rint(25, 60)), resolvedAt: daysAgo(rint(15, 24)) });
  }
  if (p.kind === 'completed' && p.story === 'fallback') {
    esc.push({ employeeId: p.id, planId: p.planId, type: 'llm_failure', severity: 'warning', message: `AI generation failed for ${p.name}; a template plan was created`, status: 'resolved', createdAt: p.createdAt, resolvedAt: p.createdAt });
  }
  if (p.kind === 'pendingStart') {
    esc.push({ employeeId: p.id, planId: p.planId, type: 'start_date_urgency', severity: 'critical', message: `${p.name} starts soon and more than 30% of onboarding tasks are incomplete`, status: 'open', createdAt: daysAgo(0) });
  }
}
await db.insert(escalations).values(esc);

// Audit events (explicit timestamps keep the timeline realistic) ---------------------------
const audit = [];
for (const p of people) {
  const created = p.createdAt;
  audit.push({ eventType: 'employee_created', employeeId: p.id, actor: 'seed:hr', details: `Employee ${p.name} (${p.role}, ${p.location}) created`, metadata: { department: p.department, start_date: p.startDate }, createdAt: created });
  if (p.mode === 'ai') {
    audit.push({
      eventType: 'ai_checklist_generated', employeeId: p.id, actor: 'ai',
      details: `AI generated draft plan v1 with ${p.rows.length} tasks`,
      metadata: { plan_id: p.planId, llm_model: env.GEMINI_MODEL, prompt_version: env.PROMPT_VERSION, tokens_used: rint(3400, 5200), latency_ms: rint(1800, 6200), overall_confidence: Math.round(p.confidence * 100) / 100, tasks_generated: p.rows.length, tasks_flagged: p.rows.filter((r) => r.requiresReview).length, policies_retrieved: ['global_onboarding.md — Day One Checklist'] },
      createdAt: new Date(created.getTime() + 8_000),
    });
  } else {
    audit.push({ eventType: 'ai_checklist_failed', employeeId: p.id, actor: 'ai', details: 'AI checklist generation failed: quota: seeded outage', metadata: { reason: 'quota' }, createdAt: new Date(created.getTime() + 5_000) });
    audit.push({ eventType: 'fallback_plan_generated', employeeId: p.id, actor: 'system', details: 'Template Plan (AI unavailable). Needs extra review (v1)', metadata: { plan_id: p.planId }, createdAt: new Date(created.getTime() + 6_000) });
  }
  if (p.approvedAt) {
    const open = p.rows.filter((r) => r.status === 'active').length;
    audit.push({ eventType: 'plan_approved', employeeId: p.id, actor: 'seed:hr', details: `Plan v1 approved; ${open} task(s) activated`, metadata: { plan_id: p.planId }, createdAt: p.approvedAt });
    p.rows.filter((r) => r.status === 'completed').slice(0, 3).forEach((r) => {
      const done = allTasks.find((t) => t.id === r.id).completedAt;
      audit.push({ eventType: 'task_status_changed', employeeId: p.id, actor: 'seed:user', details: `"${r.title}": active -> completed`, metadata: { task_id: r.id, from: 'active', to: 'completed' }, createdAt: done });
    });
  }
  if (p.rows.some((r) => r.hrModified)) {
    const r = p.rows.find((x) => x.hrModified);
    audit.push({ eventType: 'task_modified', employeeId: p.id, actor: 'seed:hr', details: `HR edited "${r.title}" (description)`, metadata: { task_id: r.id }, createdAt: new Date(created.getTime() + 3_600_000) });
  }
}
for (const e of esc) {
  audit.push({ eventType: e.status === 'resolved' ? 'escalation_resolved' : 'escalation_raised', employeeId: e.employeeId, actor: 'system', details: e.message, metadata: { type: e.type, severity: e.severity }, createdAt: e.resolvedAt ?? e.createdAt });
}

// Chat ---------------------------------------------------------------------------------------
const chatEmployees = people.filter((p) => p.kind === 'progress' || p.kind === 'overdue').slice(0, 5);
const chat = [];
const qa = [
  ['What documents do I need for India?', 'Within 3 days of joining you must submit your PAN card and Aadhaar details; you also provide bank details and PF/UAN information.', [{ doc_name: 'india_specific.md', section: 'Identity Documents (PAN and Aadhaar)', quote: 'submit a copy of their PAN card and their Aadhaar card to HR within 3 days of joining' }], 0.93],
  ['What is the dress code?', 'The dress code is business casual; wear your ID badge visibly in the office.', [{ doc_name: 'global_onboarding.md', section: 'Dress Code', quote: 'The dress code is business casual.' }], 0.9],
  ['How do I enroll in health insurance?', 'Enroll through the benefits portal within 30 days of your start date.', [{ doc_name: 'global_onboarding.md', section: 'Health Insurance Enrollment', quote: 'You must enroll within 30 days of your start date through the benefits portal' }], 0.88],
];
chatEmployees.forEach((p, i) => {
  const [q, a, cites, conf] = qa[i % qa.length];
  const t = new Date(NOW - (i + 1) * 3 * 3_600_000);
  chat.push({ employeeId: p.id, role: 'user', message: q, createdAt: t });
  chat.push({ employeeId: p.id, role: 'assistant', message: a, citations: cites, confidence: conf, escalated: false, createdAt: new Date(t.getTime() + 4_000) });
  audit.push({ eventType: 'chat_query', employeeId: p.id, actor: 'ai', details: 'Chat question answered (escalated: false)', metadata: { confidence: conf, escalated: false }, createdAt: new Date(t.getTime() + 4_000) });
});
const gap = chatEmployees[0];
const gapT = new Date(NOW - 45 * 60_000);
chat.push({ employeeId: gap.id, role: 'user', message: "What's the CEO's salary?", createdAt: gapT });
chat.push({ employeeId: gap.id, role: 'assistant', message: "I don't have information about this. Please contact HR directly.", citations: [], confidence: 0.1, escalated: true, createdAt: new Date(gapT.getTime() + 3_000) });
audit.push({ eventType: 'chat_unanswered', employeeId: gap.id, actor: 'ai', details: "Unanswered question: What's the CEO's salary?", metadata: { confidence: 0.1 }, createdAt: new Date(gapT.getTime() + 3_000) });
const inj = chatEmployees[1];
audit.push({ eventType: 'prompt_injection_suspected', employeeId: inj.id, actor: inj.email, details: 'Chat message looked like a prompt-injection attempt and was refused', metadata: { reasons: ['ignore-previous-instructions'] }, createdAt: daysAgo(1) });
await db.insert(chatMessages).values(chat);

// LLM metrics: a two-week spread so trend charts have shape ---------------------------------
const metrics = [];
for (let d = 13; d >= 0; d -= 1) {
  const n = rint(2, 5);
  for (let i = 0; i < n; i += 1) {
    const chatOp = rnd() < 0.45;
    const ok = rnd() > 0.08;
    metrics.push({
      operation: chatOp ? 'chat' : 'checklist',
      model: env.GEMINI_MODEL,
      promptVersion: env.PROMPT_VERSION,
      latencyMs: chatOp ? rint(600, 2200) : rint(1800, 7800),
      tokensIn: chatOp ? rint(900, 1800) : rint(2600, 3800),
      tokensOut: chatOp ? rint(80, 260) : rint(900, 1900),
      success: ok,
      error: ok ? null : 'quota: seeded transient failure',
      confidence: ok ? Math.round((0.62 + rnd() * 0.33 - d * 0.003) * 100) / 100 : null,
      createdAt: daysAgo(d, rint(8, 18)),
    });
  }
}
await db.insert(llmMetrics).values(metrics);
for (const part of chunked(audit, 500)) await db.insert(auditLog).values(part);

await closeDb();
logger.info(
  {
    employees: people.length,
    tasks: allTasks.length,
    escalations: esc.length,
    audit: audit.length,
    chat: chat.length,
    llmMetrics: metrics.length,
    ms: Date.now() - started,
    demoEmail: DEMO_EMAIL,
  },
  'seed complete',
);
