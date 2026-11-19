import { getEmployeeById, updateEmployee } from '../db/queries/employees.js';
import { getPlanById, getPlanProgress, updatePlan } from '../db/queries/plans.js';
import { resolveOpenForTask } from '../db/queries/escalations.js';
import {
  deleteTask,
  getTaskContext,
  insertTasks,
  listTasksByPlan,
  removeDependencyRef,
  updateTask,
} from '../db/queries/tasks.js';
import { auditLogger, AUDIT_EVENTS } from '../harness/auditLogger.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { DependencyCycleError, getBlockingTasks, tasksToNodes, unblockDependents, validateGraph } from './dependencyResolver.service.js';
import { scanSoon } from './escalation.service.js';

// Moves to overdue/escalated are made by the escalation scan, never by a user.
const TRANSITIONS = {
  pending: [],
  active: ['in_progress', 'completed'],
  in_progress: ['completed'],
  overdue: ['in_progress', 'completed'],
  escalated: ['in_progress', 'completed'],
  completed: [],
};

async function requireDraftPlan(planId) {
  const plan = await getPlanById(planId);
  if (!plan) throw notFound('Plan not found');
  if (plan.status !== 'draft') throw conflict(`Tasks can only be added or deleted while the plan is a draft (plan is ${plan.status})`);
  return plan;
}

function assertAcyclic(rows) {
  try {
    validateGraph(tasksToNodes(rows));
  } catch (err) {
    if (err instanceof DependencyCycleError) throw conflict(err.message, { cycle: err.cycle });
    throw err;
  }
}

function assigneeName(role, employee) {
  if (role === 'employee') return employee.name;
  if (role === 'manager') return employee.managerName;
  return null;
}

export async function addTask(data, user) {
  const plan = await requireDraftPlan(data.planId);
  const employee = await getEmployeeById(plan.employeeId);
  const existing = await listTasksByPlan(plan.id);

  const known = new Set(existing.map((t) => t.id));
  const bad = (data.dependencyIds ?? []).filter((id) => !known.has(id));
  if (bad.length) throw badRequest('dependencyIds must reference tasks in the same plan', { unknown: bad });

  const [task] = await insertTasks([
    {
      planId: plan.id,
      title: data.title,
      description: data.description ?? '',
      category: data.category,
      assignedToRole: data.assignedToRole,
      assignedToName: assigneeName(data.assignedToRole, employee),
      status: 'pending',
      priority: data.priority ?? 3,
      dueDate: data.dueDate,
      dependencyIds: data.dependencyIds ?? [],
      confidence: 1,
      requiresReview: false,
      policyReference: data.policyReference ?? null,
      source: 'hr_added',
    },
  ]);
  assertAcyclic([...existing, task]);

  await auditLogger.log({
    eventType: AUDIT_EVENTS.TASK_ADDED,
    employeeId: plan.employeeId,
    actor: user.id,
    details: `HR added task "${task.title}"`,
    metadata: { plan_id: plan.id, task_id: task.id },
  });
  return task;
}

export async function editTask(id, patch, user) {
  const ctx = await getTaskContext(id);
  if (!ctx) throw notFound('Task not found');
  const { task, plan, employee } = ctx;

  if (patch.dependencyIds !== undefined && plan.status !== 'draft') {
    throw conflict('Dependencies can only be changed while the plan is a draft');
  }

  const update = {};
  const changes = {};
  const set = (key, value) => {
    if (value !== undefined && value !== task[key] && JSON.stringify(value) !== JSON.stringify(task[key])) {
      changes[key] = { from: task[key], to: value };
      update[key] = value;
    }
  };
  set('title', patch.title);
  set('description', patch.description);
  set('dueDate', patch.dueDate);
  set('priority', patch.priority);
  set('assignedToRole', patch.assignedToRole);
  set('assignedToName', patch.assignedToName ?? (patch.assignedToRole ? assigneeName(patch.assignedToRole, employee) : undefined));
  set('dependencyIds', patch.dependencyIds);

  if (!Object.keys(update).length) return task;

  if (update.dependencyIds) {
    const siblings = await listTasksByPlan(plan.id);
    const known = new Set(siblings.map((t) => t.id));
    const bad = update.dependencyIds.filter((d) => !known.has(d) || d === id);
    if (bad.length) throw badRequest('dependencyIds must reference other tasks in the same plan', { invalid: bad });
    assertAcyclic(siblings.map((t) => (t.id === id ? { ...t, dependencyIds: update.dependencyIds } : t)));
  }

  const updated = await updateTask(id, { ...update, hrModified: true });
  await auditLogger.log({
    eventType: AUDIT_EVENTS.TASK_MODIFIED,
    employeeId: plan.employeeId,
    actor: user.id,
    details: `HR edited "${task.title}" (${Object.keys(changes).join(', ')})`,
    metadata: { plan_id: plan.id, task_id: id, changes },
  });
  return updated;
}

export async function confirmTask(id, user) {
  const ctx = await getTaskContext(id);
  if (!ctx) throw notFound('Task not found');
  if (ctx.plan.status !== 'draft') throw conflict('Only tasks in a draft plan can be confirmed');
  const updated = await updateTask(id, { reviewConfirmed: true });
  await auditLogger.log({
    eventType: AUDIT_EVENTS.TASK_MODIFIED,
    employeeId: ctx.plan.employeeId,
    actor: user.id,
    details: `HR confirmed flagged task "${ctx.task.title}"`,
    metadata: { plan_id: ctx.plan.id, task_id: id, review_confirmed: true, confidence: ctx.task.confidence },
  });
  return updated;
}

export async function removeTask(id, user) {
  const ctx = await getTaskContext(id);
  if (!ctx) throw notFound('Task not found');
  if (ctx.plan.status !== 'draft') throw conflict('Tasks can only be deleted while the plan is a draft');
  await removeDependencyRef(ctx.plan.id, id);
  await deleteTask(id);
  await auditLogger.log({
    eventType: AUDIT_EVENTS.TASK_DELETED,
    employeeId: ctx.plan.employeeId,
    actor: user.id,
    details: `HR deleted task "${ctx.task.title}"`,
    metadata: { plan_id: ctx.plan.id, task_id: id, source: ctx.task.source },
  });
}

function canChangeStatus(user, { task, employee }) {
  if (user.role === 'hr') return true;
  if (user.role === 'employee') return task.assignedToRole === 'employee' && user.employeeId === employee.id;
  if (user.role === 'manager') return task.assignedToRole === 'manager' && employee.managerClerkId === user.id;
  return false;
}

export async function changeStatus(id, nextStatus, user) {
  const ctx = await getTaskContext(id);
  if (!ctx) throw notFound('Task not found');
  const { task, plan, employee } = ctx;

  if (!canChangeStatus(user, ctx)) throw forbidden('You cannot update this task');
  if (!['approved', 'in_progress'].includes(plan.status)) {
    throw conflict(`Task status cannot change while the plan is ${plan.status}`);
  }
  if (!TRANSITIONS[task.status]?.includes(nextStatus)) {
    const blockers = task.status === 'pending' ? await getBlockingTasks(task) : [];
    throw conflict(`Cannot move a ${task.status} task to ${nextStatus}`, blockers.length ? { blockedBy: blockers } : undefined);
  }

  const blockers = await getBlockingTasks(task);
  if (blockers.length) throw conflict('Task has incomplete dependencies', { blockedBy: blockers });

  const updated = await updateTask(id, {
    status: nextStatus,
    completedAt: nextStatus === 'completed' ? new Date() : null,
  });

  let unblocked = [];
  if (nextStatus === 'completed') {
    unblocked = await unblockDependents(id);
    await resolveOpenForTask(id);
  }

  const progress = await getPlanProgress(plan.id);
  let planStatus = plan.status;
  if (progress.total > 0 && progress.completed === progress.total) {
    planStatus = 'completed';
    await updatePlan(plan.id, { status: 'completed' });
    await updateEmployee(employee.id, { status: 'completed' });
  } else if (plan.status === 'approved') {
    planStatus = 'in_progress';
    await updatePlan(plan.id, { status: 'in_progress' });
  }

  await auditLogger.log({
    eventType: AUDIT_EVENTS.TASK_STATUS_CHANGED,
    employeeId: employee.id,
    actor: user.id,
    details: `"${task.title}": ${task.status} -> ${nextStatus}`,
    metadata: { task_id: id, plan_id: plan.id, from: task.status, to: nextStatus, unblocked: unblocked.map((t) => t.id), plan_status: planStatus },
  });

  scanSoon();
  return { task: updated, unblocked: unblocked.map((t) => ({ id: t.id, title: t.title })), progress, planStatus };
}
