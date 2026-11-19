import { isDev } from '../config/env.js';
import { approvePlan, generatePlan, getPlanDetail, rejectPlan } from '../services/orchestrator.service.js';

export async function getPlan(req, res) {
  res.json(await getPlanDetail(req.valid.params.planId));
}

export async function generate(req, res) {
  const simulate = isDev ? (req.valid.query?.simulate ?? null) : null;
  const result = await generatePlan(req.valid.params.employeeId, { actor: req.user.id, simulate });
  res.status(201).json(result);
}

export async function approve(req, res) {
  const plan = await approvePlan(req.valid.params.planId, req.user);
  res.json({ plan });
}

export async function reject(req, res) {
  const plan = await rejectPlan(req.valid.params.planId, req.valid.body.reason, req.user);
  res.json({ plan });
}
