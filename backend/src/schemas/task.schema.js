import { z } from 'zod';
import { ASSIGNEE_ROLES, CATEGORIES } from '../services/rulesEngine.service.js';
import { dateString } from './employee.schema.js';

export const createTaskBody = z.object({
  planId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1200).optional(),
  category: z.enum(CATEGORIES),
  assignedToRole: z.enum(ASSIGNEE_ROLES),
  priority: z.number().int().min(1).max(5).optional(),
  dueDate: dateString,
  dependencyIds: z.array(z.number().int().positive()).max(30).optional(),
  policyReference: z.string().trim().max(300).nullish(),
});

export const patchTaskBody = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1200),
    dueDate: dateString,
    assignedToRole: z.enum(ASSIGNEE_ROLES),
    assignedToName: z.string().trim().max(120).nullable(),
    priority: z.number().int().min(1).max(5),
    dependencyIds: z.array(z.number().int().positive()).max(30),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

// Users may only start or finish work; overdue/escalated are set by the escalation scan.
export const statusBody = z.object({ status: z.enum(['in_progress', 'completed']) });

export const listTasksQuery = z.object({
  employeeId: z.coerce.number().int().positive().optional(),
  planId: z.coerce.number().int().positive().optional(),
  assignedToRole: z.enum(ASSIGNEE_ROLES).optional(),
});
