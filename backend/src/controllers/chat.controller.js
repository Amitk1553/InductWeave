import { answerQuestion } from '../ai/chatAssistant.js';
import { getChatMessage, getPrecedingUserMessage, listChatHistory } from '../db/queries/chat.js';
import { loadAccessibleEmployee } from '../lib/access.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { raise } from '../services/escalation.service.js';

function resolveEmployeeId(user, requested) {
  if (user.role === 'employee') {
    if (!user.employeeId) throw notFound('No employee record is linked to your account');
    return user.employeeId; // employees can only ever chat as themselves
  }
  const id = requested ?? user.employeeId;
  if (!id) throw badRequest('employeeId is required for HR and manager chat');
  return id;
}

export async function send(req, res) {
  const employee = await loadAccessibleEmployee(req.user, resolveEmployeeId(req.user, req.valid.body.employeeId));
  const message = await answerQuestion({ employee, message: req.valid.body.message });
  res.status(201).json({ message });
}

export async function history(req, res) {
  const employee = await loadAccessibleEmployee(req.user, resolveEmployeeId(req.user, req.valid.query.employeeId));
  res.json({ messages: await listChatHistory(employee.id, 100) });
}

export async function contactHr(req, res) {
  const msg = await getChatMessage(req.valid.body.messageId);
  if (!msg || msg.role !== 'assistant') throw notFound('Message not found');
  const employee = await loadAccessibleEmployee(req.user, msg.employeeId);
  if (req.user.role === 'employee' && req.user.employeeId !== employee.id) throw forbidden();

  const question = await getPrecedingUserMessage(employee.id, msg.id);
  const row = await raise(
    {
      employeeId: employee.id,
      type: 'chat_contact_hr',
      severity: 'warning',
      message: `${employee.name} asked HR to follow up: "${(question?.message ?? '').slice(0, 300)}"`,
    },
    { actor: req.user.id },
  );
  res.status(row ? 201 : 200).json({ escalation: row, alreadyRaised: !row });
}
