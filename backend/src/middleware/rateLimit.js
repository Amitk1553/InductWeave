import rateLimit from 'express-rate-limit';

const make = ({ windowMs, limit, message }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ error: { code: 'RATE_LIMITED', message } }),
  });

const ONE_MINUTE = 60 * 1000;
const FIFTEEN_MIN = 15 * 60 * 1000;

export const generalLimiter = make({
  windowMs: FIFTEEN_MIN,
  limit: 300,
  message: 'Too many requests, please try again later.',
});

// 20 requests per minute per user/IP
export const chatLimiter = make({
  windowMs: ONE_MINUTE,
  limit: 20,
  message: 'Too many chat messages. Please wait a moment before asking another question.',
});

export const generationLimiter = make({
  windowMs: FIFTEEN_MIN,
  limit: 20,
  message: 'Too many plan generation requests, please try again later.',
});
