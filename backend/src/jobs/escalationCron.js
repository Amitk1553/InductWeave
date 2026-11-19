import cron from 'node-cron';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { runScan } from '../services/escalation.service.js';

export function startEscalationCron() {
  if (!cron.validate(env.ESCALATION_CRON)) {
    logger.error({ expression: env.ESCALATION_CRON }, 'invalid ESCALATION_CRON; scheduler not started');
    return null;
  }
  const task = cron.schedule(env.ESCALATION_CRON, async () => {
    try {
      await runScan();
    } catch (err) {
      logger.error({ err }, 'scheduled escalation scan failed');
    }
  });
  logger.info({ expression: env.ESCALATION_CRON }, 'escalation scheduler started');
  return task;
}
