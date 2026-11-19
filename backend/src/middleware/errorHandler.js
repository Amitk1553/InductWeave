import { logger } from '../config/logger.js';
import { isDev } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { DependencyCycleError } from '../services/dependencyResolver.service.js';

export const notFoundHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route not found: ${req.method} ${req.path}` } });
};

export function errorHandler(err, req, res, _next) {
  let status = 500;
  let body = { code: 'INTERNAL_ERROR', message: 'Something went wrong' };

  if (err instanceof AppError) {
    status = err.status;
    body = { code: err.code, message: err.message, ...(err.details && { details: err.details }) };
  } else if (err instanceof DependencyCycleError) {
    status = 409;
    body = { code: 'DEPENDENCY_CYCLE', message: err.message, details: { cycle: err.cycle } };
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    body = { code: 'BAD_REQUEST', message: 'Malformed JSON body' };
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    body = { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' };
  } else if (err?.clerkError || err?.name === 'ClerkAPIResponseError') {
    status = err.status === 404 ? 401 : err.status >= 400 && err.status < 500 ? err.status : 502;
    body = { code: 'AUTH_PROVIDER_ERROR', message: 'Authentication provider error' };
  }

  if (status >= 500) {
    (req.log ?? logger).error({ err }, 'unhandled request error');
    if (isDev) body.message = err?.message ?? body.message;
  }
  res.status(status).json({ error: body });
}
