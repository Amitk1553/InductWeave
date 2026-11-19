import { and, desc, eq, lt } from 'drizzle-orm';
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
export async function getPrecedingUserMessage(employeeId, assistantMessageId) {
  const [row] = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.employeeId, employeeId), eq(chatMessages.role, 'user'), lt(chatMessages.id, assistantMessageId)))
    .orderBy(desc(chatMessages.id))
    .limit(1);
  return row ?? null;
}

// Newest `limit` messages, returned oldest-first.
export async function listChatHistory(employeeId, limit = 50) {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.employeeId, employeeId))
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(limit);
  return rows.reverse();
}
