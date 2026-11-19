import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/escalation.controller.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../schemas/employee.schema.js';

const router = Router();

// Mounted at both /api/escalation (scan) and /api/escalations (list/resolve).
router.post('/scan', requireRole('hr'), ctrl.scan);
router.get('/', requireRole('hr', 'manager'), validate({ query: z.object({ status: z.enum(['open', 'resolved']).optional() }) }), ctrl.list);
router.post('/:id/resolve', requireRole('hr'), validate({ params: idParams }), ctrl.resolve);

export default router;
