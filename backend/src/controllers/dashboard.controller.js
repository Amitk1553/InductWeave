import { getDashboardRaw } from '../db/queries/stats.js';
import { scopeOf } from '../middleware/auth.js';

const num = (v) => (v === null || v === undefined ? null : Number(v));

export async function stats(req, res) {
  const raw = await getDashboardRaw(scopeOf(req.user));
  const total = raw.byDepartment.reduce((s, d) => s + d.total, 0);
  const done = raw.byDepartment.reduce((s, d) => s + d.done, 0);
  res.json({
    completionRate: total ? done / total : null,
    overdueCount: raw.byDepartment.reduce((s, d) => s + d.overdue, 0),
    avgOnboardingDays: num(raw.avgOnboardingDays),
    pendingApproval: raw.pendingApproval,
    completionByDepartment: raw.byDepartment.map((d) => ({
      department: d.department,
      employees: d.employees,
      rate: d.total ? d.done / d.total : 0,
      overdue: d.overdue,
    })),
    tasksByCategory: raw.byCategory,
    tasksCompletedPerDay: raw.perDay,
    mostOverdueTasks: raw.commonlyLate,
    employeeStatus: raw.employeeStatus,
  });
}
