import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../client.js';
import { onboardingPlans, tasks } from '../schema.js';

export async function createPlan(data) {
  return db.transaction(async (tx) => {
    const [{ max }] = await tx
      .select({ max: sql`coalesce(max(${onboardingPlans.version}), 0)`.mapWith(Number) })
      .from(onboardingPlans)
      .where(eq(onboardingPlans.employeeId, data.employeeId));
    const [row] = await tx
      .insert(onboardingPlans)
      .values({ ...data, version: max + 1 })
      .returning();
    return row;
  });
}

export async function getPlanById(id) {
  const [row] = await db.select().from(onboardingPlans).where(eq(onboardingPlans.id, id));
  return row ?? null;
}

export async function getLatestPlanForEmployee(employeeId) {
  const [row] = await db
    .select()
    .from(onboardingPlans)
    .where(eq(onboardingPlans.employeeId, employeeId))
    .orderBy(desc(onboardingPlans.version))
    .limit(1);
  return row ?? null;
}

export async function listPlansForEmployee(employeeId) {
  return db
    .select({
      id: onboardingPlans.id,
      version: onboardingPlans.version,
      status: onboardingPlans.status,
      generationMode: onboardingPlans.generationMode,
      createdAt: onboardingPlans.createdAt,
    })
    .from(onboardingPlans)
    .where(eq(onboardingPlans.employeeId, employeeId))
    .orderBy(desc(onboardingPlans.version));
}

export async function updatePlan(id, patch) {
  const [row] = await db.update(onboardingPlans).set(patch).where(eq(onboardingPlans.id, id)).returning();
  return row ?? null;
}

// Older drafts stay in history but are closed so only one draft is ever actionable.
export async function supersedeDrafts(employeeId, exceptPlanId) {
  await db
    .update(onboardingPlans)
    .set({ status: 'rejected', notes: 'Superseded by a newer version' })
    .where(
      and(
        eq(onboardingPlans.employeeId, employeeId),
        eq(onboardingPlans.status, 'draft'),
        ne(onboardingPlans.id, exceptPlanId),
      ),
    );
}

export async function getPlanProgress(planId) {
  const [row] = await db
    .select({
      total: sql`count(*)`.mapWith(Number),
      completed: sql`count(*) filter (where ${tasks.status} = 'completed')`.mapWith(Number),
    })
    .from(tasks)
    .where(eq(tasks.planId, planId));
  return { ...row, percent: row.total ? Math.round((row.completed / row.total) * 100) : 0 };
}

export async function listPlansByStatus(statuses) {
  return db.select().from(onboardingPlans).where(inArray(onboardingPlans.status, statuses)).orderBy(asc(onboardingPlans.id));
}
