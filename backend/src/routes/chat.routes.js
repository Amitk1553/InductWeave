import { Router } from 'express';
import { clerkMiddleware } from '@clerk/express';
import * as ctrl from '../controllers/chat.controller.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { contactHrBody, historyQuery, sendMessageBody } from '../schemas/chat.schema.js';
import { env } from '../config/env.js';

const router = Router();

const clerkAuth = clerkMiddleware({
  publishableKey: env.CLERK_PUBLISHABLE_KEY,
  secretKey: env.CLERK_SECRET_KEY,
});

// Rate limiting (20 req/min) + optional Clerk user identification
// TODO: protect strictly with Clerk when mandatory login is enabled for all chat viewers
router.use(chatLimiter, clerkAuth);

// POST /api/chat - submit question and receive grounded answer with citations
router.post('/', validate({ body: sendMessageBody }), ctrl.send);

// GET /api/chat/history - retrieve previous turns (oldest first, limit 50)
router.get('/history', validate({ query: historyQuery }), ctrl.history);

// POST /api/chat/contact-hr - notify HR when question cannot be answered
router.post('/contact-hr', validate({ body: contactHrBody }), ctrl.contactHr);

export default router;
