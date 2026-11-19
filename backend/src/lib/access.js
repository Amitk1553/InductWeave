import { getEmployeeById } from '../db/queries/employees.js';
import { forbidden, notFound } from './errors.js';

export const canAccessEmployee = (user, employee) =>
  user.role === 'hr' ||
  (user.role === 'manager' && employee.managerClerkId === user.id) ||
  user.employeeId === employee.id;

/** Loads an employee and enforces the caller's data scope; 404 (not 403) for hidden records. */
export async function loadAccessibleEmployee(user, employeeId) {
  const employee = await getEmployeeById(employeeId);
  if (!employee) throw notFound('Employee not found');
  if (!canAccessEmployee(user, employee)) throw forbidden();
  return employee;
}

const HIDDEN_PLAN_STATUSES = ['draft', 'rejected'];

/** Non-HR callers must not learn anything about a plan HR has not approved yet. */
export function maskPlanFields(row, role) {
  if (role === 'hr' || !row.planStatus || !HIDDEN_PLAN_STATUSES.includes(row.planStatus)) return row;
  return {
    ...row,
    planId: null,
    planStatus: 'preparing',
    generationMode: null,
    aiConfidence: null,
    totalTasks: 0,
    completedTasks: 0,
    overdueTasks: 0,
  };
}
