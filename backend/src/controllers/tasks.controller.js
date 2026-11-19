import { getLatestPlanForEmployee, getPlanProgress } from '../db/queries/plans.js';
import { listTasksScoped } from '../db/queries/tasks.js';
import { loadAccessibleEmployee } from '../lib/access.js';
import { scopeOf } from '../middleware/auth.js';
import { annotateBlocked } from '../services/dependencyResolver.service.js';
import * as lifecycle from '../services/taskLifecycle.service.js';

export async function list(req, res) {
  const { user } = req;
  const query = req.valid.query;
  // Employees only ever see their own tasks, whatever they ask for.
  const employeeId = user.role === 'employee' ? user.employeeId : query.employeeId;
  if (user.role === 'employee' && !employeeId) return res.json({ tasks: [], plan: null });

  const rows = await listTasksScoped(scopeOf(user), { ...query, employeeId });
  const tasks = await annotateBlocked(rows);

  let plan = null;
  if (employeeId) {
    const employee = await loadAccessibleEmployee(user, employeeId);
    const latest = await getLatestPlanForEmployee(employee.id);
    if (latest) {
      const hidden = user.role !== 'hr' && ['draft', 'rejected'].includes(latest.status);
      plan = hidden
        ? { status: 'preparing' }
        : { id: latest.id, status: latest.status, generationMode: latest.generationMode, progress: await getPlanProgress(latest.id) };
    }
  }
  res.json({ tasks, plan });
}

export async function create(req, res) {
  res.status(201).json({ task: await lifecycle.addTask(req.valid.body, req.user) });
}

export async function patch(req, res) {
  res.json({ task: await lifecycle.editTask(req.valid.params.id, req.valid.body, req.user) });
}

export async function confirm(req, res) {
  res.json({ task: await lifecycle.confirmTask(req.valid.params.id, req.user) });
}

export async function remove(req, res) {
  await lifecycle.removeTask(req.valid.params.id, req.user);
  res.status(204).end();
}

export async function updateStatus(req, res) {
  res.json(await lifecycle.changeStatus(req.valid.params.id, req.valid.body.status, req.user));
}
