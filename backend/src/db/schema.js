import 'dotenv/config';
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core';

// Read directly (not via config/env.js) so drizzle-kit can load this file without full env validation.
export const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS || 768);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const employees = pgTable(
  'employees',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    role: text('role').notNull(),
    department: text('department').notNull(),
    location: text('location').notNull(),
    startDate: date('start_date').notNull(),
    // pending | onboarding | completed | cancelled
    status: text('status').notNull().default('pending'),
    managerName: text('manager_name'),
    managerEmail: text('manager_email'),
    managerClerkId: text('manager_clerk_id'),
    clerkUserId: text('clerk_user_id'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('employees_email_uq').on(t.email),
    index('employees_manager_clerk_idx').on(t.managerClerkId),
  ],
);

export const onboardingPlans = pgTable(
  'onboarding_plans',
  {
    id: serial('id').primaryKey(),
    employeeId: integer('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    // draft | approved | rejected | in_progress | completed
    status: text('status').notNull().default('draft'),
    version: integer('version').notNull().default(1),
    // ai | fallback
    generationMode: text('generation_mode').notNull().default('ai'),
    aiConfidence: doublePrecision('ai_confidence'),
    aiRawResponse: jsonb('ai_raw_response'),
    complianceScore: doublePrecision('compliance_score'),
    complianceMissing: jsonb('compliance_missing'),
    notes: text('notes'),
    approvedBy: text('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('plans_employee_idx').on(t.employeeId)],
);

export const tasks = pgTable(
  'tasks',
  {
    id: serial('id').primaryKey(),
    planId: integer('plan_id')
      .notNull()
      .references(() => onboardingPlans.id, { onDelete: 'cascade' }),
    templateId: text('template_id'),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    // documents | equipment | training | access | introductions
    category: text('category').notNull(),
    // hr | it | manager | employee
    assignedToRole: text('assigned_to_role').notNull(),
    assignedToName: text('assigned_to_name'),
    // pending | active | in_progress | completed | overdue | escalated
    status: text('status').notNull().default('pending'),
    priority: integer('priority').notNull().default(3),
    dueDate: date('due_date').notNull(),
    dependencyIds: integer('dependency_ids')
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    confidence: doublePrecision('confidence').notNull().default(1),
    requiresReview: boolean('requires_review').notNull().default(false),
    reviewReason: text('review_reason'),
    reviewConfirmed: boolean('review_confirmed').notNull().default(false),
    policyReference: text('policy_reference'),
    // rule | ai | hr_added
    source: text('source').notNull().default('rule'),
    hrModified: boolean('hr_modified').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('tasks_plan_idx').on(t.planId), index('tasks_status_due_idx').on(t.status, t.dueDate)],
);

export const policyChunks = pgTable(
  'policy_chunks',
  {
    id: serial('id').primaryKey(),
    docName: text('doc_name').notNull(),
    section: text('section').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    locationScope: text('location_scope').notNull().default('global'),
    roleScope: text('role_scope').notNull().default('all'),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('policy_chunks_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
    index('policy_chunks_doc_idx').on(t.docName, t.chunkIndex),
  ],
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: serial('id').primaryKey(),
    employeeId: integer('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    // user | assistant
    role: text('role').notNull(),
    message: text('message').notNull(),
    citations: jsonb('citations'),
    confidence: doublePrecision('confidence'),
    escalated: boolean('escalated').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('chat_employee_idx').on(t.employeeId, t.createdAt)],
);

export const escalations = pgTable(
  'escalations',
  {
    id: serial('id').primaryKey(),
    employeeId: integer('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    planId: integer('plan_id').references(() => onboardingPlans.id, { onDelete: 'cascade' }),
    taskId: integer('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    // warning | critical
    severity: text('severity').notNull().default('warning'),
    message: text('message').notNull(),
    // open | resolved
    status: text('status').notNull().default('open'),
    createdAt: createdAt(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [index('escalations_status_idx').on(t.status, t.employeeId)],
);

// INSERT-only: a DB trigger (see migrations) rejects UPDATE and DELETE.
export const auditLog = pgTable(
  'audit_log',
  {
    id: serial('id').primaryKey(),
    eventType: text('event_type').notNull(),
    employeeId: integer('employee_id'),
    actor: text('actor').notNull(),
    details: text('details').notNull().default(''),
    metadata: jsonb('metadata'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_employee_idx').on(t.employeeId, t.createdAt)],
);

export const llmMetrics = pgTable('llm_metrics', {
  id: serial('id').primaryKey(),
  // checklist | chat
  operation: text('operation').notNull(),
  model: text('model').notNull(),
  promptVersion: text('prompt_version').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  success: boolean('success').notNull(),
  error: text('error'),
  confidence: doublePrecision('confidence'),
  createdAt: createdAt(),
});
