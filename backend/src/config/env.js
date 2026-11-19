import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CLERK_PUBLISHABLE_KEY: z.string().min(1, 'CLERK_PUBLISHABLE_KEY is required'),
  CLERK_SECRET_KEY: z.string().min(1, 'CLERK_SECRET_KEY is required'),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash'),
  GEMINI_EMBEDDING_MODEL: z.string().min(1).default('gemini-embedding-001'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().min(128).max(3072).default(768),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.1),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  RAG_TOP_K: z.coerce.number().int().positive().default(5),
  CHUNK_SIZE: z.coerce.number().int().positive().default(500),
  CHUNK_OVERLAP: z.coerce.number().int().nonnegative().default(50),
  PROMPT_VERSION: z.string().min(1).default('v1.2'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  ESCALATION_CRON: z.string().min(1).default('0 * * * *'),
  FORCE_LLM_FAILURE: bool,
  LOG_LEVEL: z.string().default('info'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_DRIVER: z.enum(['auto', 'pg', 'neon']).default('auto'),
});

// Empty strings in .env (e.g. `GEMINI_EMBEDDING_MODEL=`) should fall back to defaults.
const raw = Object.fromEntries(
  Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ''),
);

const parsed = schema.safeParse(raw);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
  process.stderr.write(
    `\nInvalid environment configuration. Fix backend/.env (see .env.example):\n${lines.join('\n')}\n\n`,
  );
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
export const isDev = env.NODE_ENV === 'development';
