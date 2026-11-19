import pino from 'pino';
import { env, isDev } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  ...(isDev && {
    transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
  }),
});
