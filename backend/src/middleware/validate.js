import { badRequest } from '../lib/errors.js';

/**
 * Validates req.body / req.query / req.params against Zod schemas.
 * Parsed values land on req.valid (Express 5 makes req.query read-only).
 */
export const validate =
  ({ body, query, params } = {}) =>
  (req, _res, next) => {
    const valid = {};
    for (const [key, schema] of Object.entries({ body, query, params })) {
      if (!schema) continue;
      const result = schema.safeParse(req[key] ?? {});
      if (!result.success) {
        throw badRequest(
          'Request validation failed',
          result.error.issues.map((i) => ({ in: key, path: i.path.join('.'), message: i.message })),
        );
      }
      valid[key] = result.data;
    }
    req.valid = valid;
    next();
  };
