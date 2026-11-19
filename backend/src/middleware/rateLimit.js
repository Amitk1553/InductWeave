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

const FIFTEEN_MIN = 15 * 60 * 1000;

export const generalLimiter = make({
  windowMs: FIFTEEN_MIN,
  limit: 300,
  message: 'Too many requests, please try again later.',
});

export const chatLimiter = make({
  windowMs: FIFTEEN_MIN,
  limit: 40,
  message: 'Too many chat messages, please slow down.',
});

export const generationLimiter = make({
  windowMs: FIFTEEN_MIN,
  limit: 20,
  message: 'Too many plan generation requests, please try again later.',
});
