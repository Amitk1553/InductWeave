import { neonConfig, Pool as NeonPool, types as neonTypes } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import ws from 'ws';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import * as schema from './schema.js';

// Neon hosts use the WebSocket driver (port 443) because many networks block outbound 5432.
const dbUrl = new URL(env.DATABASE_URL);
export const driver = env.DB_DRIVER === 'auto' ? (dbUrl.hostname.endsWith('.neon.tech') ? 'neon' : 'pg') : env.DB_DRIVER;

const poolOptions = {
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 30_000,
};

let pool;
let db;

// Keep `date` columns as 'YYYY-MM-DD' strings (the driver would otherwise build local-time Date objects).
if (driver === 'neon') {
  neonConfig.webSocketConstructor = ws;
  neonTypes.setTypeParser(1082, (v) => v);
  // The WebSocket driver does not implement channel binding.
  dbUrl.searchParams.delete('channel_binding');
  pool = new NeonPool({ connectionString: dbUrl.toString(), ...poolOptions });
  db = drizzleNeon(pool, { schema });
} else {
  pg.types.setTypeParser(1082, (v) => v);
  pool = new pg.Pool({ connectionString: env.DATABASE_URL, ...poolOptions });
  db = drizzlePg(pool, { schema });
}

// Neon drops idle connections; without a handler this would crash the process.
pool.on('error', (err) => logger.warn({ err }, 'idle postgres client error'));

export { db, pool };

export async function closeDb() {
  await pool.end();
}
