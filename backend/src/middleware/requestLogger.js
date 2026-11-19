import pinoHttp from 'pino-http';
import { logger } from '../config/logger.js';

export const requestLogger = pinoHttp({
  logger,
  autoLogging: { ignore: (req) => req.url === '/health' },
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
  customSuccessMessage: (req, res, ms) => `${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Math.round(ms)}ms`,
  customErrorMessage: (req, res) => `${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} failed`,
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, endpoint: req.url?.split('?')[0] }),
    res: (res) => ({ status: res.statusCode }),
  },
});
