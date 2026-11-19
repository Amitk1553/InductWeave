import { clerkClient, clerkMiddleware, getAuth } from '@clerk/express';
import { env } from '../config/env.js';
import { getEmployeeByEmail, linkManagerByEmail, updateEmployee } from '../db/queries/employees.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export const ROLES = ['hr', 'manager', 'employee'];
const CACHE_TTL_MS = 30_000;
const cache = new Map();

export const clerk = clerkMiddleware({
  publishableKey: env.CLERK_PUBLISHABLE_KEY,
  secretKey: env.CLERK_SECRET_KEY,
});

export const invalidateUser = (userId) => cache.delete(userId);

async function loadUser(userId) {
  const hit = cache.get(userId);
  if (hit && hit.expires > Date.now()) return hit.user;

  const cu = await clerkClient.users.getUser(userId);
  const email =
    cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress ??
    cu.emailAddresses[0]?.emailAddress ??
    null;
  const metaRole = cu.publicMetadata?.role;
  const role = ROLES.includes(metaRole) ? metaRole : 'employee';

  // Managers are linked to their direct reports by email the first time they appear.
  if (role === 'manager' && email) await linkManagerByEmail(userId, email);

  let employeeId = null;
  if (email) {
    const emp = await getEmployeeByEmail(email);
    if (emp) {
      employeeId = emp.id;
      if (emp.clerkUserId !== userId) await updateEmployee(emp.id, { clerkUserId: userId });
    }
  }

  const user = {
    id: userId,
    email,
    role,
    name: [cu.firstName, cu.lastName].filter(Boolean).join(' ') || email,
    employeeId,
  };
  cache.set(userId, { user, expires: Date.now() + CACHE_TTL_MS });
  return user;
}

export async function requireAuth(req, _res, next) {
  const { userId } = getAuth(req);
  if (!userId) throw unauthorized();
  req.user = await loadUser(userId);
  next();
}

/** Use after requireAuth. Example: router.get('/', requireRole('hr', 'manager'), handler) */
export const requireRole =
  (...allowed) =>
  (req, _res, next) => {
    if (!req.user) throw unauthorized();
    if (!allowed.includes(req.user.role)) throw forbidden(`Requires role: ${allowed.join(' or ')}`);
    next();
  };

/** Data-scope descriptor consumed by the db/queries layer. */
export const scopeOf = (user) => ({ role: user.role, clerkId: user.id, employeeId: user.employeeId });
