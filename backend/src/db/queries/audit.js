import { asc, eq } from 'drizzle-orm';
import { db } from '../client.js';
import { auditLog } from '../schema.js';

// The only write path to audit_log. There is intentionally no update/delete here
// and the database trigger rejects them as well.
export async function insertAudit(entry) {
  const [row] = await db.insert(auditLog).values(entry).returning();
  return row;
}

export async function listAudit({ employeeId, limit = 500 } = {}) {
  const q = db.select().from(auditLog);
  return (employeeId ? q.where(eq(auditLog.employeeId, employeeId)) : q)
    .orderBy(asc(auditLog.createdAt), asc(auditLog.id))
    .limit(limit);
}
