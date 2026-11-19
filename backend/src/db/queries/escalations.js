import { and, desc, eq, getTableColumns, isNull } from 'drizzle-orm';
import { db } from '../client.js';
import { employees, escalations } from '../schema.js';

/** Inserts unless an identical open escalation exists. Returns the new row or null. */
export async function createEscalationIfNew({ employeeId, planId = null, taskId = null, type, severity, message }) {
  const subject = taskId
    ? eq(escalations.taskId, taskId)
    : and(isNull(escalations.taskId), planId ? eq(escalations.planId, planId) : isNull(escalations.planId));
  const [existing] = await db
    .select({ id: escalations.id })
    .from(escalations)
    .where(and(eq(escalations.status, 'open'), eq(escalations.type, type), eq(escalations.employeeId, employeeId), subject))
    .limit(1);
  if (existing) return null;
  const [row] = await db
    .insert(escalations)
    .values({ employeeId, planId, taskId, type, severity, message })
    .returning();
  return row;
}

export async function getEscalation(id) {
  const [row] = await db
    .select({ ...getTableColumns(escalations), employeeName: employees.name, managerClerkId: employees.managerClerkId })
    .from(escalations)
    .innerJoin(employees, eq(escalations.employeeId, employees.id))
    .where(eq(escalations.id, id));
  return row ?? null;
}

export async function listEscalations(scope, { status } = {}) {
  const conds = [];
  if (status) conds.push(eq(escalations.status, status));
  if (scope.role === 'manager') conds.push(eq(employees.managerClerkId, scope.clerkId));
  return db
    .select({ ...getTableColumns(escalations), employeeName: employees.name })
    .from(escalations)
    .innerJoin(employees, eq(escalations.employeeId, employees.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(escalations.createdAt), desc(escalations.id))
    .limit(200);
}

export async function resolveEscalation(id) {
  const [row] = await db
    .update(escalations)
    .set({ status: 'resolved', resolvedAt: new Date() })
    .where(and(eq(escalations.id, id), eq(escalations.status, 'open')))
    .returning();
  return row ?? null;
}

export async function resolveOpenForTask(taskId) {
  return db
    .update(escalations)
    .set({ status: 'resolved', resolvedAt: new Date() })
    .where(and(eq(escalations.taskId, taskId), eq(escalations.status, 'open')))
    .returning();
}
