import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { closeDb } from './db/client.js';
import { startEscalationCron } from './jobs/escalationCron.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT} (docs at /docs)`);
  if (env.FORCE_LLM_FAILURE) logger.warn('FORCE_LLM_FAILURE is on: every Gemini call will fail and fallback plans will be used');
});

const cronTask = startEscalationCron();

async function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  cronTask?.stop();
  server.close(async () => {
    await closeDb().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled promise rejection'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception');
  process.exit(1);
});
