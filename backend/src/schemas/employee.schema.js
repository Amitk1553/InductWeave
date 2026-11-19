import { z } from 'zod';
import { isValidDateStr } from '../lib/dates.js';

const text = (max = 120) => z.string().trim().min(1, 'Required').max(max);

export const idParams = z.object({ id: z.coerce.number().int().positive() });

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine(isValidDateStr, 'Not a valid date');

export const createEmployeeBody = z.object({
  name: text(),
  email: z.email('Invalid email').max(200).transform((v) => v.toLowerCase()),
  role: text(80),
  department: text(80),
  location: text(80),
  startDate: dateString,
  managerName: text().optional(),
  managerEmail: z
    .union([z.email('Invalid manager email').max(200), z.literal('')])
    .optional()
    .transform((v) => (v ? v.toLowerCase() : undefined)),
});
