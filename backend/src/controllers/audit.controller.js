import { listAudit } from '../db/queries/audit.js';

export async function list(req, res) {
  res.json({ events: await listAudit({ employeeId: req.valid.query.employeeId }) });
}
