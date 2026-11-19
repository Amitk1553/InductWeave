import { inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tasks as tasksTable } from '../db/schema.js';
import { getTaskById, getTasksByIds, listTasksByPlan } from '../db/queries/tasks.js';

export class DependencyCycleError extends Error {
  constructor(cycleTitles) {
    super(`Dependency cycle detected: ${cycleTitles.join(' -> ')}`);
    this.name = 'DependencyCycleError';
    this.cycle = cycleTitles;
  }
}

/** Follow unresolved edges until a node repeats; returns the nodes on that cycle. */
function findCycle(remaining, byId) {
  const start = remaining.values().next().value;
  const path = [];
  const seenAt = new Map();
  let current = start;
  while (current !== undefined && !seenAt.has(current)) {
    seenAt.set(current, path.length);
    path.push(current);
    current = byId.get(current).dependsOn.find((d) => remaining.has(d));
  }
  return current === undefined ? path : [...path.slice(seenAt.get(current)), current];
}

/**
 * Kahn's algorithm over nodes `{ id, title?, dependsOn: [] }`.
 * Throws DependencyCycleError naming the cycle. References to unknown ids are ignored.
 */
export function validateGraph(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const indegree = new Map();
  const dependents = new Map(nodes.map((n) => [n.id, []]));

  for (const n of nodes) {
    const deps = [...new Set(n.dependsOn)].filter((d) => byId.has(d));
    indegree.set(n.id, deps.length);
    for (const d of deps) dependents.get(d).push(n.id);
  }

  const queue = [...indegree].filter(([, deg]) => deg === 0).map(([id]) => id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of dependents.get(id)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }

  if (order.length !== nodes.length) {
    const remaining = new Set(nodes.map((n) => n.id).filter((id) => !order.includes(id)));
    const cycle = findCycle(remaining, byId).map((id) => byId.get(id).title ?? String(id));
    throw new DependencyCycleError(cycle);
  }
  return order;
}

export const tasksToNodes = (rows) =>
  rows.map((t) => ({ id: t.id, title: t.title, dependsOn: t.dependencyIds ?? [] }));

/** Initial statuses for a freshly approved plan: no unmet dependencies => active. */
export function resolveInitialStates(rows) {
  const done = new Set(rows.filter((t) => t.status === 'completed').map((t) => t.id));
  return rows.map((t) => ({
    id: t.id,
    status: (t.dependencyIds ?? []).every((d) => done.has(d)) ? 'active' : 'pending',
  }));
}

export async function applyInitialStates(planId) {
  const rows = await listTasksByPlan(planId);
  const states = resolveInitialStates(rows);
  const toActivate = states.filter((s) => s.status === 'active').map((s) => s.id);
  if (toActivate.length) {
    await db.update(tasksTable).set({ status: 'active' }).where(inArray(tasksTable.id, toActivate));
  }
  return { activated: toActivate.length, pending: states.length - toActivate.length };
}

/** When a task completes, promote pending dependents whose dependencies are all completed. */
export async function unblockDependents(taskId) {
  const task = await getTaskById(taskId);
  if (!task) return [];
  const planTasks = await listTasksByPlan(task.planId);
  const done = new Set(planTasks.filter((t) => t.status === 'completed').map((t) => t.id));
  const unblocked = planTasks.filter(
    (t) => t.status === 'pending' && t.dependencyIds.includes(taskId) && t.dependencyIds.every((d) => done.has(d)),
  );
  if (unblocked.length) {
    await db
      .update(tasksTable)
      .set({ status: 'active' })
      .where(inArray(tasksTable.id, unblocked.map((t) => t.id)));
  }
  return unblocked;
}

/** Dependencies that are not yet completed, as [{ id, title, status }]. */
export async function getBlockingTasks(task) {
  if (!task.dependencyIds?.length) return [];
  const deps = await getTasksByIds(task.dependencyIds);
  return deps.filter((d) => d.status !== 'completed').map((d) => ({ id: d.id, title: d.title, status: d.status }));
}

/** Adds `blockedBy` to each task using a single dependency lookup. */
export async function annotateBlocked(rows) {
  const depIds = [...new Set(rows.flatMap((t) => t.dependencyIds ?? []))];
  const deps = new Map((await getTasksByIds(depIds)).map((d) => [d.id, d]));
  return rows.map((t) => ({
    ...t,
    blockedBy: (t.dependencyIds ?? [])
      .map((id) => deps.get(id))
      .filter((d) => d && d.status !== 'completed')
      .map((d) => ({ id: d.id, title: d.title, status: d.status })),
  }));
}
