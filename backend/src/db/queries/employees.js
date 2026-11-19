import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../client.js';
import { employees } from '../schema.js';

export async function createEmployee(data) {
  const [row] = await db.insert(employees).values(data).returning();
  return row;
}

export async function getEmployeeById(id) {
  const [row] = await db.select().from(employees).where(eq(employees.id, id));
  return row ?? null;
}

export async function getEmployeeByEmail(email) {
  const [row] = await db
    .select()
    .from(employees)
    .where(sql`lower(${employees.email}) = ${email.toLowerCase()}`);
  return row ?? null;
}

// A Clerk account can hold several addresses; any of them may be the one HR entered.
export async function getEmployeeByEmails(emails) {
  const lowered = [...new Set(emails.map((e) => e.toLowerCase()))];
  if (!lowered.length) return null;
  const [row] = await db
    .select()
    .from(employees)
    .where(sql`lower(${employees.email}) IN (${sql.join(lowered.map((e) => sql`${e}`), sql`, `)})`)
    .limit(1);
  return row ?? null;
}

export async function updateEmployee(id, patch) {
  const [row] = await db.update(employees).set(patch).where(eq(employees.id, id)).returning();
  return row ?? null;
}

// Managers log in later than the hire is created; link them by email on first sight.
export async function linkManagerByEmail(clerkId, email) {
  if (!email) return;
  await db.execute(sql`
    UPDATE employees SET manager_clerk_id = ${clerkId}
    WHERE lower(manager_email) = ${email.toLowerCase()} AND manager_clerk_id IS DISTINCT FROM ${clerkId}`);
}

export async function getEmployeesByManager(clerkId) {
  return db.select().from(employees).where(eq(employees.managerClerkId, clerkId)).orderBy(desc(employees.createdAt));
}

/**
 * Employees with their latest plan and task counters.
 * scope: { role: 'hr' } | { role: 'manager', clerkId } | { role: 'employee', employeeId }
 */
export async function listEmployeesWithProgress(scope, { employeeId } = {}) {
  let where = sql``;
  if (employeeId) where = sql`WHERE e.id = ${employeeId}`;
  else if (scope.role === 'manager') where = sql`WHERE e.manager_clerk_id = ${scope.clerkId}`;
  else if (scope.role === 'employee') where = sql`WHERE e.id = ${scope.employeeId}`;

  const { rows } = await db.execute(sql`
    SELECT e.id, e.name, e.email, e.role, e.department, e.location, e.start_date AS "startDate", e.status,
           e.manager_name AS "managerName", e.manager_email AS "managerEmail", e.created_at AS "createdAt",
           p.id AS "planId", p.status AS "planStatus", p.generation_mode AS "generationMode",
           p.ai_confidence AS "aiConfidence",
           COALESCE(t.total, 0)::int AS "totalTasks",
           COALESCE(t.done, 0)::int AS "completedTasks",
           COALESCE(t.overdue, 0)::int AS "overdueTasks"
    FROM employees e
    LEFT JOIN LATERAL (
      SELECT id, status, generation_mode, ai_confidence FROM onboarding_plans
      WHERE employee_id = e.id ORDER BY version DESC LIMIT 1
    ) p ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS total,
             count(*) FILTER (WHERE status = 'completed') AS done,
             count(*) FILTER (WHERE status IN ('overdue', 'escalated')) AS overdue
      FROM tasks WHERE plan_id = p.id
    ) t ON true
    ${where}
    ORDER BY e.created_at DESC, e.id DESC`);
  return rows;
}
