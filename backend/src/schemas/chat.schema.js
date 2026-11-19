import { z } from 'zod';

export const sendMessageBody = z.object({
  message: z.string().trim().min(1, 'Message is empty').max(1000, 'Message cannot exceed 1000 characters'),
  locationScope: z.string().optional(),
  // HR/managers may chat in the context of one of their employees; employees always chat as themselves.
  employeeId: z.number().int().positive().optional(),
});

export const historyQuery = z.object({
  employeeId: z.coerce.number().int().positive().optional(),
  userKey: z.string().optional(),
});

export const contactHrBody = z.object({ messageId: z.number().int().positive() });
