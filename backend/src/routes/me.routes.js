import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/me.controller.js';
import { isDev } from '../config/env.js';
import { ROLES } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/me', ctrl.me);

// DEV ONLY: lets one account demo all three roles. Not registered outside NODE_ENV=development.
if (isDev) {
  router.post('/dev/role', validate({ body: z.object({ role: z.enum(ROLES) }) }), ctrl.setDevRole);
}

export default router;
