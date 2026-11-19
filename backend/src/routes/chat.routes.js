import { Router } from 'express';
import * as ctrl from '../controllers/chat.controller.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { contactHrBody, historyQuery, sendMessageBody } from '../schemas/chat.schema.js';

const router = Router();

router.post('/', chatLimiter, validate({ body: sendMessageBody }), ctrl.send);
router.get('/history', validate({ query: historyQuery }), ctrl.history);
router.post('/contact-hr', validate({ body: contactHrBody }), ctrl.contactHr);

export default router;
