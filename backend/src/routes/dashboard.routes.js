import { Router } from 'express';
import * as ctrl from '../controllers/dashboard.controller.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/stats', requireRole('hr', 'manager'), ctrl.stats);

export default router;
