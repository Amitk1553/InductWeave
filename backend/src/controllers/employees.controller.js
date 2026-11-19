import { clerkClient } from '@clerk/express';
import { isDev } from '../config/env.js';
import { logger } from '../config/logger.js';
import { createEmployee, listEmployeesWithProgress } from '../db/queries/employees.js';
import { auditLogger, AUDIT_EVENTS } from '../harness/auditLogger.js';
import { conflict } from '../lib/errors.js';
import { loadAccessibleEmployee, maskPlanFields } from '../lib/access.js';
import { generatePlan } from '../services/orchestrator.service.js';
import { scopeOf } from '../middleware/auth.js';

async function findClerkIdByEmail(email) {
  if (!email) return null;
  try {
    const { data } = await clerkClient.users.getUserList({ emailAddress: [email] });
    return data[0]?.id ?? null;
  } catch (err) {
    logger.warn({ err: err.message }, 'could not look up manager in Clerk');
    return null;
  }
}

export async function create(req, res) {
  const body = req.valid.body;
  const managerClerkId = await findClerkIdByEmail(body.managerEmail);

  let employee;
  try {
    employee = await createEmployee({
      name: body.name,
      email: body.email,
      role: body.role,
      department: body.department,
      location: body.location,
      startDate: body.startDate,
      status: 'pending',
      managerName: body.managerName ?? null,
      managerEmail: body.managerEmail ?? null,
      managerClerkId,
    });
  } catch (err) {
    // Drizzle wraps the driver error, so the SQLSTATE lives on `cause`.
    if ((err?.cause?.code ?? err?.code) === '23505') throw conflict('An employee with this email already exists');
    throw err;
  }

  await auditLogger.log({
    eventType: AUDIT_EVENTS.EMPLOYEE_CREATED,
    employeeId: employee.id,
    actor: req.user.id,
    details: `Employee ${employee.name} (${employee.role}, ${employee.location}) created`,
    metadata: { department: employee.department, start_date: employee.startDate },
  });

  const simulate = isDev ? (req.valid.query?.simulate ?? null) : null;
  try {
    const result = await generatePlan(employee.id, { actor: req.user.id, simulate });
    res.status(201).json({ employee, plan: result.plan, mode: result.mode, tasksCreated: result.tasksCreated });
  } catch (err) {
    // The hire exists even if planning failed unexpectedly; HR can retry generation.
    logger.error({ err, employeeId: employee.id }, 'plan generation failed after employee creation');
    res.status(201).json({ employee, plan: null, mode: null, planError: 'Plan generation failed; retry from the employee page.' });
  }
}

export async function list(req, res) {
  const rows = await listEmployeesWithProgress(scopeOf(req.user));
  res.json({ employees: rows.map((r) => maskPlanFields(r, req.user.role)) });
}

export async function getOne(req, res) {
  const employee = await loadAccessibleEmployee(req.user, req.valid.params.id);
  const [row] = await listEmployeesWithProgress(scopeOf(req.user), { employeeId: employee.id });
  res.json({ employee, summary: maskPlanFields(row, req.user.role) });
}
