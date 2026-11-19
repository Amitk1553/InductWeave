import { Router } from 'express';
import * as ctrl from '../controllers/onboarding.controller.js';
import { requireRole } from '../middleware/auth.js';
import { generationLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { employeeIdParams, generateQuery, planIdParams, rejectBody } from '../schemas/onboarding.schema.js';

const router = Router();
router.use(requireRole('hr'));

router.post('/generate/:employeeId', generationLimiter, validate({ params: employeeIdParams, query: generateQuery }), ctrl.generate);
router.get('/:planId', validate({ params: planIdParams }), ctrl.getPlan);
router.post('/:planId/approve', validate({ params: planIdParams }), ctrl.approve);
router.post('/:planId/reject', validate({ params: planIdParams, body: rejectBody }), ctrl.reject);

export default router;
