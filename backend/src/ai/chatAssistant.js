import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { insertChatMessage, listChatHistory } from '../db/queries/chat.js';
import { auditLogger, AUDIT_EVENTS } from '../harness/auditLogger.js';
import { finalizeLlmCall } from '../harness/observability.js';
import { describeProfile } from '../services/rulesEngine.service.js';
import { generateJson, LlmError } from './geminiClient.js';
import { validateChatOutput } from './guardrails.js';
import {
  buildChatPrompt,
  CHAT_SYSTEM,
  INJECTION_REFUSAL_TEXT,
  REFUSAL_TEXT,
  UNAVAILABLE_TEXT,
} from './promptTemplates.js';
import { formatChunks, retrieve } from './ragPipeline.js';
import { sanitizeText } from './sanitizer.js';
import { chatResponseJsonSchema } from '../schemas/aiOutput.schema.js';

const LOW_CONFIDENCE = 0.3;
const normalize = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const isRefusal = (answer) => normalize(answer).startsWith(normalize(REFUSAL_TEXT).slice(0, 40));

async function reply(employee, userRow, { answer, citations = [], confidence = null, escalated = false, auditMeta = {} }) {
  const assistant = await insertChatMessage({
    employeeId: employee.id,
    role: 'assistant',
    message: answer,
    citations,
    confidence,
    escalated,
  });
  await auditLogger.log({
    eventType: AUDIT_EVENTS.CHAT_QUERY,
    employeeId: employee.id,
    actor: 'ai',
    details: `Chat question answered (escalated: ${escalated})`,
    metadata: { message_id: assistant.id, confidence, escalated, citations: citations.length, ...auditMeta },
  });
  if (escalated && !auditMeta.llm_error) {
    await auditLogger.log({
      eventType: AUDIT_EVENTS.CHAT_UNANSWERED,
      employeeId: employee.id,
      actor: 'ai',
      details: `Unanswered question: ${userRow.message}`,
      metadata: { message_id: assistant.id, user_message_id: userRow.id, confidence },
    });
  }
  return assistant;
}

/**
 * Policy-grounded Q&A. Pipeline: sanitize -> retrieve -> prompt -> validate -> verify citations -> escalate.
 * Never throws for model problems; the employee always gets a usable reply.
 */
export async function answerQuestion({ employee, message, simulate = null }) {
  const { text, flagged, reasons, truncated } = sanitizeText(message, { maxLength: 1000 });

  // History must be read before saving the new question so it is not echoed back as "earlier".
  const history = (await listChatHistory(employee.id, 5)).map((m) => ({
    role: m.role,
    message: sanitizeText(m.message, { maxLength: 600 }).text,
  }));

  const userRow = await insertChatMessage({ employeeId: employee.id, role: 'user', message: text || '(empty)' });

  if (flagged) {
    await auditLogger.log({
      eventType: AUDIT_EVENTS.PROMPT_INJECTION_SUSPECTED,
      employeeId: employee.id,
      actor: employee.email,
      details: 'Chat message looked like a prompt-injection attempt and was refused',
      metadata: { reasons, truncated, message_id: userRow.id },
    });
    return reply(employee, userRow, { answer: INJECTION_REFUSAL_TEXT, confidence: null, auditMeta: { refused: 'injection' } });
  }
  if (!text) {
    return reply(employee, userRow, { answer: 'Please type a question about onboarding policies.', auditMeta: { refused: 'empty' } });
  }

  const { country, locationScope } = describeProfile(employee);

  let chunks;
  try {
    chunks = await retrieve(text, { topK: env.RAG_TOP_K, locationScope: locationScope ? [locationScope, 'global'] : ['global'] });
  } catch (err) {
    logger.warn({ err: err.message }, 'chat retrieval failed');
    return reply(employee, userRow, { answer: UNAVAILABLE_TEXT, confidence: 0, escalated: true, auditMeta: { llm_error: 'retrieval_failed' } });
  }

  if (chunks.length === 0) {
    return reply(employee, userRow, { answer: REFUSAL_TEXT, confidence: 0.1, escalated: true, auditMeta: { reason: 'no_policies_retrieved' } });
  }

  let gen;
  try {
    gen = await generateJson({
      operation: 'chat',
      systemInstruction: CHAT_SYSTEM,
      prompt: buildChatPrompt({ question: text, history, chunkText: formatChunks(chunks), country }),
      responseJsonSchema: chatResponseJsonSchema,
      simulate,
    });
  } catch (err) {
    if (!(err instanceof LlmError)) throw err;
    return reply(employee, userRow, { answer: UNAVAILABLE_TEXT, confidence: 0, escalated: true, auditMeta: { llm_error: err.kind } });
  }

  const result = validateChatOutput(gen.text, chunks);
  if (!result.valid) {
    await finalizeLlmCall(gen.metricId, { success: false, error: result.error?.slice(0, 500) });
    return reply(employee, userRow, { answer: UNAVAILABLE_TEXT, confidence: 0, escalated: true, auditMeta: { llm_error: 'invalid_output', detail: result.error } });
  }

  let { answer, citations, confidence } = result;
  const refusal = isRefusal(answer);
  // An answer with no verifiable citation is ungrounded, so it is treated as "not in the policies".
  const ungrounded = !refusal && citations.length === 0;

  if (refusal || ungrounded) {
    answer = REFUSAL_TEXT;
    citations = [];
    confidence = Math.min(confidence, 0.2);
  }
  await finalizeLlmCall(gen.metricId, { success: true, confidence });

  return reply(employee, userRow, {
    answer,
    citations,
    confidence,
    escalated: refusal || ungrounded || confidence < LOW_CONFIDENCE,
    auditMeta: {
      llm_model: env.GEMINI_MODEL,
      prompt_version: env.PROMPT_VERSION,
      latency_ms: gen.latencyMs,
      tokens_used: (gen.tokensIn ?? 0) + (gen.tokensOut ?? 0),
      policies_retrieved: chunks.length,
      dropped_citations: result.droppedCitations,
      ungrounded,
    },
  });
}
