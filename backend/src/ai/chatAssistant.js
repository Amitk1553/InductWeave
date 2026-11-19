import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { insertChatMessage, listChatHistory } from '../db/queries/chat.js';
import { auditLogger, AUDIT_EVENTS } from '../harness/auditLogger.js';
import { finalizeLlmCall } from '../harness/observability.js';
import { generateJson, LlmError } from './geminiClient.js';
import { validateChatOutput } from './guardrails.js';
import {
  buildChatPrompt,
  buildCorrectionPrompt,
  CHAT_SYSTEM,
  INJECTION_REFUSAL_TEXT,
  REFUSAL_TEXT,
  UNAVAILABLE_TEXT,
} from './promptTemplates.js';
import { retrieve } from './ragPipeline.js';
import { sanitizeText } from './sanitizer.js';
import { chatResponseJsonSchema } from '../schemas/aiOutput.schema.js';

const LOW_CONFIDENCE_THRESHOLD = 0.3;

const normalizeStr = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const isRefusal = (answer) => {
  const normA = normalizeStr(answer);
  const normR = normalizeStr(REFUSAL_TEXT);
  return (
    normA.includes(normR) ||
    normA.includes('don t have information') ||
    normA.includes('added soon') ||
    normA.includes('contact hr directly')
  );
};

/**
 * Policy-grounded Q&A Assistant.
 * Pipeline: sanitize -> retrieve -> similarity gate -> prompt -> call LLM -> validate -> verify citations -> escalate.
 * Returns { answer, citations: [{ doc_title, doc_name, section }], confidence, escalated }.
 */
export async function answerQuestion({
  question,
  message,
  history,
  locationScope,
  employee,
  userKey,
  simulate = null,
}) {
  const rawText = question ?? message ?? '';
  const startTime = Date.now();

  // 1. Sanitize input & detect prompt injection
  const { clean, flagged, reasons, truncated } = sanitizeText(rawText, { maxLength: 1000 });

  const effectiveUserKey = userKey ?? (employee ? String(employee.id) : 'anonymous');
  const employeeId = employee?.id ?? (typeof userKey === 'number' ? userKey : null);

  if (flagged) {
    logger.warn({ reasons, truncated, userKey: effectiveUserKey }, 'Prompt injection detected in chat question');
    if (employeeId) {
      await auditLogger.log({
        eventType: AUDIT_EVENTS.PROMPT_INJECTION_SUSPECTED,
        employeeId,
        actor: employee?.email ?? effectiveUserKey,
        details: 'Chat message flagged for prompt injection and refused',
        metadata: { reasons, truncated },
      });
    }

    const refusalResult = {
      answer: INJECTION_REFUSAL_TEXT,
      citations: [],
      confidence: 0,
      escalated: true,
    };

    if (effectiveUserKey) {
      await insertChatMessage({ userKey: effectiveUserKey, employeeId, role: 'user', message: rawText });
      await insertChatMessage({
        userKey: effectiveUserKey,
        employeeId,
        role: 'assistant',
        message: refusalResult.answer,
        citations: refusalResult.citations,
        confidence: refusalResult.confidence,
        escalated: refusalResult.escalated,
      });
    }

    return refusalResult;
  }

  if (!clean) {
    return {
      answer: 'Please ask a question about company policies.',
      citations: [],
      confidence: 0,
      escalated: false,
    };
  }

  // Determine location scope if not explicitly given
  let scope = locationScope;
  if (!scope && employee?.location) {
    const loc = employee.location.toLowerCase();
    if (loc.includes('india') || loc.includes('mumbai') || loc.includes('bangalore')) scope = 'india';
    else if (loc.includes('us') || loc.includes('york') || loc.includes('united states')) scope = 'us';
    else scope = 'global';
  }

  // 2. Retrieve top-K chunks
  let chunks = [];
  try {
    chunks = await retrieve(clean, { topK: env.RAG_TOP_K, locationScope: scope });
  } catch (err) {
    logger.warn({ err: err.message }, 'Chat vector retrieval failed');
    return {
      answer: UNAVAILABLE_TEXT,
      citations: [],
      confidence: 0,
      escalated: true,
    };
  }

  const topScore = chunks[0]?.score ?? 0;
  const minScore = env.RAG_MIN_SCORE ?? 0.35;

  logger.info(
    { query: clean, chunksCount: chunks.length, topScore, minScore, latencyMs: Date.now() - startTime },
    'Chat retrieval completed',
  );

  // 3. Similarity gate: if no chunks or topScore < RAG_MIN_SCORE, skip LLM and refuse
  if (chunks.length === 0 || topScore < minScore) {
    logger.info({ topScore, minScore, query: clean }, 'Similarity gate triggered: skipping LLM and refusing');
    const refusalResult = {
      answer: REFUSAL_TEXT,
      citations: [],
      confidence: 0,
      escalated: true,
    };

    if (effectiveUserKey) {
      await insertChatMessage({ userKey: effectiveUserKey, employeeId, role: 'user', message: clean });
      await insertChatMessage({
        userKey: effectiveUserKey,
        employeeId,
        role: 'assistant',
        message: refusalResult.answer,
        citations: refusalResult.citations,
        confidence: refusalResult.confidence,
        escalated: refusalResult.escalated,
      });
    }

    return refusalResult;
  }

  // 4. Build history context (last CHAT_HISTORY_TURNS messages)
  const turns = env.CHAT_HISTORY_TURNS || 5;
  let historyTurns = [];
  if (Array.isArray(history)) {
    historyTurns = history.slice(-turns);
  } else if (effectiveUserKey) {
    const dbHistory = await listChatHistory(effectiveUserKey, turns);
    historyTurns = dbHistory.map((m) => ({ role: m.role, message: m.message }));
  }

  // 5. Prompt construction
  const prompt = buildChatPrompt({ question: clean, history: historyTurns, chunks });

  // 6. Call Gemini in JSON mode with retry on transient error / malformed output
  let gen;
  try {
    gen = await generateJson({
      operation: 'chat',
      systemInstruction: CHAT_SYSTEM,
      prompt,
      responseJsonSchema: chatResponseJsonSchema,
      temperature: env.LLM_TEMPERATURE,
      simulate,
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'LLM call failed');
    return {
      answer: UNAVAILABLE_TEXT,
      citations: [],
      confidence: 0,
      escalated: true,
    };
  }

  // Validate output with Zod loose parser
  let validation = validateChatOutput(gen.text, chunks);

  // If initial JSON parsing or schema validation failed, retry once with correction prompt
  if (!validation.valid) {
    logger.warn({ error: validation.error }, 'Initial LLM chat output invalid, retrying with correction prompt...');
    try {
      const correctionPrompt = buildCorrectionPrompt(prompt, gen.text, validation.error);
      const retryGen = await generateJson({
        operation: 'chat',
        systemInstruction: CHAT_SYSTEM,
        prompt: correctionPrompt,
        responseJsonSchema: chatResponseJsonSchema,
        temperature: env.LLM_TEMPERATURE,
      });
      validation = validateChatOutput(retryGen.text, chunks);
      if (retryGen.metricId) {
        await finalizeLlmCall(retryGen.metricId, { success: validation.valid, confidence: validation.confidence });
      }
    } catch (retryErr) {
      logger.error({ retryErr }, 'Correction retry call failed');
    }
  }

  if (!validation.valid) {
    if (gen.metricId) await finalizeLlmCall(gen.metricId, { success: false, error: validation.error });
    return {
      answer: UNAVAILABLE_TEXT,
      citations: [],
      confidence: 0,
      escalated: true,
    };
  }

  let { answer, citations, confidence } = validation;
  const refusal = isRefusal(answer);
  const ungrounded = !refusal && citations.length === 0;

  // 7. Citation verification check
  if (ungrounded) {
    confidence = Math.min(confidence, 0.2);
  }

  // 8. Escalation gate
  const shouldEscalate = refusal || ungrounded || confidence < LOW_CONFIDENCE_THRESHOLD;

  if (refusal) {
    answer = REFUSAL_TEXT;
    citations = [];
    confidence = Math.min(confidence, 0.2);
  }

  if (gen.metricId) {
    await finalizeLlmCall(gen.metricId, { success: true, confidence });
  }

  const finalResult = {
    answer,
    citations,
    confidence,
    escalated: shouldEscalate,
  };

  // 9. Persist messages to DB if userKey/employee is known
  if (effectiveUserKey) {
    try {
      await insertChatMessage({ userKey: effectiveUserKey, employeeId, role: 'user', message: clean });
      const assistantRow = await insertChatMessage({
        userKey: effectiveUserKey,
        employeeId,
        role: 'assistant',
        message: finalResult.answer,
        citations: finalResult.citations,
        confidence: finalResult.confidence,
        escalated: finalResult.escalated,
      });

      if (employeeId) {
        await auditLogger.log({
          eventType: AUDIT_EVENTS.CHAT_QUERY,
          employeeId,
          actor: 'ai',
          details: `Chat question answered (escalated: ${finalResult.escalated})`,
          metadata: { message_id: assistantRow.id, confidence, escalated: finalResult.escalated, topScore },
        });
      }
    } catch (dbErr) {
      logger.warn({ dbErr }, 'Failed to persist chat messages to DB');
    }
  }

  return finalResult;
}
