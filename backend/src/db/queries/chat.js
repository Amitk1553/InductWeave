import { and, desc, eq, lt, or } from 'drizzle-orm';
import { db } from '../client.js';
import { chatMessages } from '../schema.js';

export async function insertChatMessage(data) {
  const [row] = await db.insert(chatMessages).values(data).returning();
  return row;
}

export async function getChatMessage(id) {
  const [row] = await db.select().from(chatMessages).where(eq(chatMessages.id, id));
  return row ?? null;
}

// The question an assistant reply answered.
export async function getPrecedingUserMessage(employeeIdOrUserKey, assistantMessageId) {
  const condition =
    typeof employeeIdOrUserKey === 'number'
      ? eq(chatMessages.employeeId, employeeIdOrUserKey)
      : eq(chatMessages.userKey, String(employeeIdOrUserKey));

  const [row] = await db
    .select()
    .from(chatMessages)
    .where(and(condition, eq(chatMessages.role, 'user'), lt(chatMessages.id, assistantMessageId)))
    .orderBy(desc(chatMessages.id))
    .limit(1);
  return row ?? null;
}

// Newest `limit` messages, returned oldest-first.
export async function listChatHistory(param, limit = 50) {
  let condition;
  if (typeof param === 'number') {
    condition = eq(chatMessages.employeeId, param);
  } else if (typeof param === 'string') {
    condition = eq(chatMessages.userKey, param);
  } else if (param && typeof param === 'object') {
    if (param.employeeId) {
      condition = eq(chatMessages.employeeId, param.employeeId);
    } else if (param.userKey) {
      condition = eq(chatMessages.userKey, param.userKey);
    } else {
      condition = eq(chatMessages.userKey, 'anonymous');
    }
  } else {
    condition = eq(chatMessages.userKey, 'anonymous');
  }

  const rows = await db
    .select()
    .from(chatMessages)
    .where(condition)
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(limit);
  return rows.reverse();
}
