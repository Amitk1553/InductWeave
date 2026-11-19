import { and, asc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { db } from '../client.js';
import { employees, onboardingPlans, tasks } from '../schema.js';

export const VISIBLE_PLAN_STATUSES = ['approved', 'in_progress', 'completed'];

export async function insertTasks(rows) {
  if (!rows.length) return [];
  return db.insert(tasks).values(rows).returning();
}

// Reserving ids up front lets a whole plan (with intra-plan dependencies) go in one INSERT.
export async function reserveTaskIds(count) {
  if (!count) return [];
  const { rows } = await db.execute(
    sql`SELECT nextval(pg_get_serial_sequence('tasks', 'id'))::int AS id FROM generate_series(1, ${count})`,
  );
  return rows.map((r) => r.id);
}

// Draft-plan tasks the model was unsure about and HR has not yet confirmed.
export async function listUnconfirmedLowConfidence() {
  return db
    .select({ planId: tasks.planId, employeeId: onboardingPlans.employeeId, count: sql`count(*)`.mapWith(Number) })
    .from(tasks)
    .innerJoin(onboardingPlans, eq(tasks.planId, onboardingPlans.id))
    .where(
      and(
        eq(onboardingPlans.status, 'draft'),
        eq(tasks.requiresReview, true),
        eq(tasks.reviewConfirmed, false),
        sql`${tasks.confidence} < 0.3`,
      ),
    )
    .groupBy(tasks.planId, onboardingPlans.employeeId);
}

export async function getTaskById(id) {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
  return row ?? null;
}

export async function getTasksByIds(ids) {
  if (!ids.length) return [];
  return db.select().from(tasks).where(inArray(tasks.id, ids));
}

export async function listTasksByPlan(planId) {
  return db.select().from(tasks).where(eq(tasks.planId, planId)).orderBy(asc(tasks.dueDate), asc(tasks.priority), asc(tasks.id));
}

export async function updateTask(id, patch) {
  const [row] = await db.update(tasks).set(patch).where(eq(tasks.id, id)).returning();
  return row ?? null;
}

export async function deleteTask(id) {
  await db.delete(tasks).where(eq(tasks.id, id));
}

// Remove a deleted task from every dependency list in its plan.
export async function removeDependencyRef(planId, taskId) {
  await db.execute(sql`
    UPDATE tasks SET dependency_ids = array_remove(dependency_ids, ${taskId})
    WHERE plan_id = ${planId} AND ${taskId} = ANY(dependency_ids)`);
}

/**
 * Scoped task listing joined with owning plan/employee.
 * scope: { role: 'hr' } | { role: 'manager', clerkId } | { role: 'employee', employeeId }
 * Non-HR callers never see tasks of draft/rejected plans.
 */
export async function listTasksScoped(scope, { employeeId, assignedToRole, planId } = {}) {
  const conds = [];
  if (scope.role !== 'hr') conds.push(inArray(onboardingPlans.status, VISIBLE_PLAN_STATUSES));
  if (scope.role === 'manager') conds.push(eq(employees.managerClerkId, scope.clerkId));
  if (scope.role === 'employee') conds.push(eq(employees.id, scope.employeeId));
  if (employeeId) conds.push(eq(employees.id, employeeId));
  if (planId) conds.push(eq(onboardingPlans.id, planId));
  if (assignedToRole) conds.push(eq(tasks.assignedToRole, assignedToRole));

  return db
    .select({
      ...getTableColumns(tasks),
      employeeId: employees.id,
      employeeName: employees.name,
      planStatus: onboardingPlans.status,
    })
    .from(tasks)
    .innerJoin(onboardingPlans, eq(tasks.planId, onboardingPlans.id))
    .innerJoin(employees, eq(onboardingPlans.employeeId, employees.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(tasks.dueDate), asc(tasks.priority), asc(tasks.id));
}

/** Task + plan + employee, used for authorization checks. */
export async function getTaskContext(id) {
  const [row] = await db
    .select({
      task: tasks,
      plan: onboardingPlans,
      employee: employees,
    })
    .from(tasks)
    .innerJoin(onboardingPlans, eq(tasks.planId, onboardingPlans.id))
    .innerJoin(employees, eq(onboardingPlans.employeeId, employees.id))
    .where(eq(tasks.id, id));
  return row ?? null;
}

// Candidates for the escalation scan: live tasks on approved/in-progress plans.
export async function listLiveTasks() {
  return db
    .select({
      ...getTableColumns(tasks),
      employeeId: employees.id,
      employeeName: employees.name,
      employeeStartDate: employees.startDate,
    })
    .from(tasks)
    .innerJoin(onboardingPlans, eq(tasks.planId, onboardingPlans.id))
    .innerJoin(employees, eq(onboardingPlans.employeeId, employees.id))
    .where(inArray(onboardingPlans.status, ['approved', 'in_progress']));
}
