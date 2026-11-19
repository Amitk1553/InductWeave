import { clerkClient } from '@clerk/express';
import { invalidateUser } from '../middleware/auth.js';

export function me(req, res) {
  res.json({ user: req.user });
}

// Dev-only demo helper so one account can show all three views. Mounted only when NODE_ENV=development.
export async function setDevRole(req, res) {
  const { role } = req.valid.body;
  await clerkClient.users.updateUserMetadata(req.user.id, { publicMetadata: { role } });
  invalidateUser(req.user.id);
  res.json({ role });
}
