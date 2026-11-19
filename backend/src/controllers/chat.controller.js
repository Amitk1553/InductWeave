import { getAuth } from '@clerk/express';
import { answerQuestion } from '../ai/chatAssistant.js';
import { locationScopeFor } from '../ai/ragPipeline.js';
import { logger } from '../config/logger.js';
import { getChatMessage, getPrecedingUserMessage, listChatHistory } from '../db/queries/chat.js';
import { getEmployeeById } from '../db/queries/employees.js';
import { notFound } from '../lib/errors.js';
import { raise } from '../services/escalation.service.js';

function getChatUserKey(req) {
  try {
    const auth = getAuth(req);
    if (auth?.userId) return auth.userId;
  } catch {
    // ignore
  }
  return req.user?.id || 'anonymous';
}

export async function send(req, res) {
  const started = Date.now();
  const userKey = getChatUserKey(req);

  let employee = null;
  const requestedEmpId = req.valid.body.employeeId || req.user?.employeeId;
  if (requestedEmpId) {
    employee = await getEmployeeById(requestedEmpId);
  }

  const explicitScope = req.valid.body.locationScope;
  const locationScope = explicitScope || (employee?.location ? locationScopeFor(employee.location) : undefined);

  const result = await answerQuestion({
    question: req.valid.body.message,
    locationScope,
    employee,
    userKey,
  });

  const latencyMs = Date.now() - started;
  logger.info(
    {
      userKey,
      latencyMs,
      escalated: result.escalated,
      citationsCount: result.citations.length,
      confidence: result.confidence,
    },
    'Chat message handled',
  );

  res.status(200).json({
    answer: result.answer,
    citations: result.citations,
    confidence: result.confidence,
    escalated: result.escalated,
    // Message object for client backwards-compatibility
    message: {
      role: 'assistant',
      message: result.answer,
      citations: result.citations,
      confidence: result.confidence,
      escalated: result.escalated,
    },
  });
}

export async function history(req, res) {
  const userKey = getChatUserKey(req);
  const employeeId = req.valid.query.employeeId || req.user?.employeeId;
  const messages = await listChatHistory({ userKey, employeeId, limit: 50 });
  res.json({ messages });
}

export async function contactHr(req, res) {
  const msg = await getChatMessage(req.valid.body.messageId);
  if (!msg || msg.role !== 'assistant') throw notFound('Message not found');

  const question = await getPrecedingUserMessage(msg.employeeId || msg.userKey, msg.id);
  const targetEmployeeId = msg.employeeId || req.user?.employeeId;

  if (targetEmployeeId) {
    const row = await raise(
      {
        employeeId: targetEmployeeId,
        type: 'chat_contact_hr',
        severity: 'warning',
        message: `Employee requested HR assistance with unanswered question: "${(question?.message ?? '').slice(0, 300)}"`,
      },
      { actor: req.user?.id || 'employee' },
    );
    return res.status(row ? 201 : 200).json({ escalation: row, alreadyRaised: !row });
  }

  res.status(200).json({ message: 'HR notification recorded', alreadyRaised: false });
}
