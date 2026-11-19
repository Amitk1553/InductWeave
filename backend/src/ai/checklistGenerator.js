import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { auditLogger, AUDIT_EVENTS } from '../harness/auditLogger.js';
import { finalizeLlmCall } from '../harness/observability.js';
import { describeProfile, getRequiredTasks, getTemplates } from '../services/rulesEngine.service.js';
import { generateJson, LlmError } from './geminiClient.js';
import { validateAiOutput } from './guardrails.js';
import { buildChecklistPrompt, buildCorrectionPrompt, CHECKLIST_SYSTEM } from './promptTemplates.js';
import { formatChunks, retrieve } from './ragPipeline.js';
import { sanitizeProfile } from './sanitizer.js';
import { checklistResponseJsonSchema } from '../schemas/aiOutput.schema.js';

export class AiGenerationError extends Error {
  constructor(message, { reason, cause, rejected = [], rawResponse = null } = {}) {
    super(message, { cause });
    this.name = 'AiGenerationError';
    this.reason = reason ?? message;
    this.rejected = rejected;
    this.rawResponse = rawResponse;
  }
}

async function callAndValidate({ prompt, startDate, simulate }) {
  const gen = await generateJson({
    operation: 'checklist',
    systemInstruction: CHECKLIST_SYSTEM,
    prompt,
    responseJsonSchema: checklistResponseJsonSchema,
    simulate,
  });
  const validation = validateAiOutput(gen.text, { startDate });
  await finalizeLlmCall(gen.metricId, {
    success: validation.valid,
    confidence: validation.overallConfidence,
    error: validation.valid ? null : validation.error?.slice(0, 500),
  });
  return { gen, validation };
}

/**
 * Asks Gemini for a checklist grounded in retrieved policies, validated by guardrails.
 * One automatic retry with a correction prompt; throws AiGenerationError when still unusable.
 */
export async function generateChecklist(employee, { simulate = null } = {}) {
  const { profile, flags } = sanitizeProfile({
    role: employee.role,
    department: employee.department,
    location: employee.location,
    startDate: employee.startDate,
  });

  for (const flag of flags) {
    await auditLogger.log({
      eventType: AUDIT_EVENTS.PROMPT_INJECTION_SUSPECTED,
      employeeId: employee.id ?? null,
      actor: 'system',
      details: `Suspicious content in profile field "${flag.field}"; replaced before sending to the model`,
      metadata: { field: flag.field, reasons: flag.reasons },
    });
  }

  const mandatoryTasks = getRequiredTasks(employee);
  const { locationScope } = describeProfile(employee);

  let chunks = [];
  try {
    chunks = await retrieve(`onboarding requirements for ${profile.location} ${profile.role} ${profile.department}`, {
      topK: env.RAG_TOP_K,
      locationScope: locationScope ? [locationScope, 'global'] : ['global'],
    });
  } catch (err) {
    // Policies improve the answer but are not required to produce a validated draft.
    logger.warn({ err: err.message }, 'policy retrieval failed; continuing without excerpts');
  }

  const prompt = buildChecklistPrompt({
    profile,
    mandatoryTasks,
    policyText: formatChunks(chunks),
    templates: getTemplates(),
  });

  let first;
  try {
    first = await callAndValidate({ prompt, startDate: employee.startDate, simulate });
  } catch (err) {
    if (err instanceof LlmError) throw new AiGenerationError(`LLM unavailable: ${err.message}`, { reason: `${err.kind}: ${err.message}`, cause: err });
    throw err;
  }

  let { gen, validation } = first;
  let retried = false;
  const allRejected = [...validation.rejected];

  if (!validation.valid) {
    retried = true;
    logger.warn({ error: validation.error }, 'checklist failed validation; retrying with correction prompt');
    try {
      ({ gen, validation } = await callAndValidate({
        prompt: buildCorrectionPrompt(prompt, gen.text, validation.error),
        startDate: employee.startDate,
        simulate,
      }));
    } catch (err) {
      if (err instanceof LlmError) throw new AiGenerationError(`LLM unavailable on retry: ${err.message}`, { reason: `${err.kind}: ${err.message}`, cause: err, rejected: allRejected });
      throw err;
    }
    allRejected.push(...validation.rejected);
    if (!validation.valid) {
      throw new AiGenerationError('AI output failed validation after retry', {
        reason: validation.error,
        rejected: allRejected,
        rawResponse: gen.text,
      });
    }
  }

  return {
    tasks: validation.tasks,
    rejected: allRejected,
    overallConfidence: validation.overallConfidence,
    rawResponse: gen.text,
    chunks,
    usage: { tokensIn: gen.tokensIn, tokensOut: gen.tokensOut, latencyMs: gen.latencyMs },
    retried,
  };
}
