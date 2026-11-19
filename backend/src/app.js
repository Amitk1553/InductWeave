import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { env } from './config/env.js';
import { clerk, requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { requestLogger } from './middleware/requestLogger.js';
import audit from './routes/audit.routes.js';
import chat from './routes/chat.routes.js';
import dashboard from './routes/dashboard.routes.js';
import employees from './routes/employees.routes.js';
import escalation from './routes/escalation.routes.js';
import me from './routes/me.routes.js';
import observability from './routes/observability.routes.js';
import onboarding from './routes/onboarding.routes.js';
import tasks from './routes/tasks.routes.js';

const openApiSpec = YAML.parse(
  readFileSync(fileURLToPath(new URL('../openapi.yaml', import.meta.url)), 'utf8'),
);

export function createApp() {
  const app = express();
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.use(requestLogger);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'Onboarding Orchestrator API' }));

  const api = express.Router();
  api.use(generalLimiter, clerk, requireAuth);
  api.use(me);
  api.use('/employees', employees);
  api.use('/onboarding', onboarding);
  api.use('/tasks', tasks);
  api.use('/chat', chat);
  api.use('/dashboard', dashboard);
  api.use('/escalation', escalation);
  api.use('/escalations', escalation);
  api.use('/audit', audit);
  api.use('/observability', observability);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
