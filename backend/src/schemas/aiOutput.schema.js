import { z } from 'zod';
import { ASSIGNEE_ROLES, CATEGORIES } from '../services/rulesEngine.service.js';

const optionalText = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? v.trim() : null));

export const aiTaskSchema = z.object({
  template_id: optionalText,
  title: z.string().trim().min(1, 'title is empty').max(200),
  description: z.string().trim().max(1200).default(''),
  category: z.enum(CATEGORIES),
  assigned_to_role: z.enum(ASSIGNEE_ROLES),
  priority: z.number().int().min(1).max(5),
  due_date_offset_days: z.number().int().min(-30).max(90),
  confidence: z.number().min(0).max(1),
  policy_reference: optionalText,
});

export const aiChecklistRootSchema = z.object({ tasks: z.array(z.unknown()) });

export const chatAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(3000),
  citations: z
    .array(
      z.object({
        doc_name: z.string().trim().min(1),
        section: z.string().trim().min(1),
        quote: z.string().trim().max(600).default(''),
      }),
    )
    .default([]),
  confidence: z.number().min(0).max(1),
});

// JSON Schema handed to Gemini (structured output). Zod remains the source of truth for validation.
export const checklistResponseJsonSchema = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          template_id: { type: 'string', description: 'Template id if based on a library template, else empty string' },
          title: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string', enum: CATEGORIES },
          assigned_to_role: { type: 'string', enum: ASSIGNEE_ROLES },
          priority: { type: 'integer', description: '1 (highest) to 5' },
          due_date_offset_days: { type: 'integer', description: 'Days relative to the start date; negative = before' },
          confidence: { type: 'number', description: '0.0 to 1.0' },
          policy_reference: { type: 'string', description: 'Policy doc name and section, or empty string' },
        },
        required: ['title', 'description', 'category', 'assigned_to_role', 'priority', 'due_date_offset_days', 'confidence'],
      },
    },
  },
  required: ['tasks'],
};

export const chatResponseJsonSchema = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          doc_name: { type: 'string' },
          section: { type: 'string' },
          quote: { type: 'string' },
        },
        required: ['doc_name', 'section', 'quote'],
      },
    },
    confidence: { type: 'number', description: '0.0 to 1.0' },
  },
  required: ['answer', 'citations', 'confidence'],
};
