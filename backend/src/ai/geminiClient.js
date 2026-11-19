import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { recordLlmCall } from '../harness/observability.js';

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export class LlmError extends Error {
  constructor(message, { kind = 'error', status, cause, metricId = null } = {}) {
    super(message, { cause });
    this.name = 'LlmError';
    this.kind = kind; // timeout | quota | forced | empty | error
    this.status = status;
    this.metricId = metricId;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isTransient = (status) => status === 500 || status === 502 || status === 503 || status === 504;

function classify(err) {
  const status = err?.status ?? err?.code;
  if (err?.name === 'AbortError' || /timed? ?out/i.test(err?.message ?? '')) return 'timeout';
  if (status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(err?.message ?? '')) return 'quota';
  return 'error';
}

async function callOnce({ systemInstruction, prompt, responseJsonSchema, temperature }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.LLM_TIMEOUT_MS);
  try {
    return await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction,
        temperature,
        responseMimeType: 'application/json',
        ...(responseJsonSchema && { responseJsonSchema }),
        abortSignal: controller.signal,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls Gemini in JSON mode. Retries once on transient server errors.
 * `simulate` ('failure' | 'malformed') exists for demos and the eval script only.
 * Returns { text, tokensIn, tokensOut, latencyMs, metricId }; throws LlmError otherwise.
 */
export async function generateJson({
  operation,
  systemInstruction,
  prompt,
  responseJsonSchema,
  temperature = env.LLM_TEMPERATURE,
  simulate = null,
}) {
  const started = Date.now();

  if (env.FORCE_LLM_FAILURE || simulate === 'failure') {
    const metricId = await recordLlmCall({ operation, latencyMs: 0, success: false, error: 'Forced LLM failure (demo switch)' });
    throw new LlmError('LLM failure forced by demo switch', { kind: 'forced', metricId });
  }

  if (simulate === 'malformed') {
    const text = '{ "tasks": [ { "title": "Truncated';
    const metricId = await recordLlmCall({ operation, latencyMs: Date.now() - started, success: true, tokensIn: 0, tokensOut: 0 });
    return { text, tokensIn: 0, tokensOut: 0, latencyMs: Date.now() - started, metricId };
  }

  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const res = await callOnce({ systemInstruction, prompt, responseJsonSchema, temperature });
      const latencyMs = Date.now() - started;
      const text = res.text;
      const tokensIn = res.usageMetadata?.promptTokenCount ?? null;
      const tokensOut = res.usageMetadata?.candidatesTokenCount ?? null;
      if (!text) {
        const metricId = await recordLlmCall({ operation, latencyMs, tokensIn, tokensOut, success: false, error: 'Empty response (possibly blocked)' });
        throw new LlmError('Gemini returned an empty response', { kind: 'empty', metricId });
      }
      const metricId = await recordLlmCall({ operation, latencyMs, tokensIn, tokensOut, success: true });
      return { text, tokensIn, tokensOut, latencyMs, metricId };
    } catch (err) {
      if (err instanceof LlmError) throw err;
      lastErr = err;
      if (attempt === 1 && isTransient(err?.status)) {
        logger.warn({ status: err.status }, 'transient Gemini error, retrying once');
        await sleep(1000);
        continue;
      }
      break;
    }
  }

  const kind = classify(lastErr);
  const metricId = await recordLlmCall({
    operation,
    latencyMs: Date.now() - started,
    success: false,
    error: `${kind}: ${lastErr?.message ?? 'unknown error'}`,
  });
  logger.warn({ kind, status: lastErr?.status, msg: lastErr?.message }, 'Gemini call failed');
  throw new LlmError(`Gemini call failed (${kind})`, { kind, status: lastErr?.status, cause: lastErr, metricId });
}

export { ai as genAiClient };
