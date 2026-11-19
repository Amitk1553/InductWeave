import { z } from 'zod';

export const planIdParams = z.object({ planId: z.coerce.number().int().positive() });
export const employeeIdParams = z.object({ employeeId: z.coerce.number().int().positive() });

export const rejectBody = z.object({ reason: z.string().trim().min(3, 'Give a short reason').max(500) });

// `simulate` forces failure paths for demos and the eval script; the route ignores it in production.
export const generateQuery = z.object({ simulate: z.enum(['failure', 'malformed']).optional() });
