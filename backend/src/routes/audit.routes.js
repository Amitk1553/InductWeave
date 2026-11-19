import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/audit.controller.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/', requireRole('hr'), validate({ query: z.object({ employeeId: z.coerce.number().int().positive().optional() }) }), ctrl.list);

export default router;
