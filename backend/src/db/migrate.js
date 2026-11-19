import { migrate as migrateNeon } from 'drizzle-orm/neon-serverless/migrator';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { logger } from '../config/logger.js';
import { closeDb, db, driver } from './client.js';

// Same migration folder and journal as drizzle-kit, but over the app's own driver (WebSocket on Neon).
const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

try {
  await (driver === 'neon' ? migrateNeon : migratePg)(db, { migrationsFolder });
  logger.info({ driver }, 'migrations applied');
} catch (err) {
  logger.error({ err }, 'migration failed');
  process.exitCode = 1;
} finally {
  await closeDb();
}
