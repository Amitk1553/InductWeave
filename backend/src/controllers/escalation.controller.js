import { listEscalations } from '../db/queries/escalations.js';
import { scopeOf } from '../middleware/auth.js';
import * as escalationService from '../services/escalation.service.js';

export async function scan(_req, res) {
  res.json({ summary: await escalationService.runScan() });
}

export async function list(req, res) {
  res.json({ escalations: await listEscalations(scopeOf(req.user), { status: req.valid.query.status }) });
}

export async function resolve(req, res) {
  res.json({ escalation: await escalationService.resolve(req.valid.params.id, { actor: req.user.id }) });
}
