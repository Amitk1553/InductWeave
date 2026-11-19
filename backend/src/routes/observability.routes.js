import { Router } from 'express';
import * as ctrl from '../controllers/observability.controller.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/metrics', requireRole('hr'), ctrl.metrics);

export default router;
