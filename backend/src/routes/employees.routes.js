import { Router } from 'express';
import * as ctrl from '../controllers/employees.controller.js';
import { requireRole } from '../middleware/auth.js';
import { generationLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { createEmployeeBody, idParams } from '../schemas/employee.schema.js';
import { generateQuery } from '../schemas/onboarding.schema.js';

const router = Router();

router.post('/', requireRole('hr'), generationLimiter, validate({ body: createEmployeeBody, query: generateQuery }), ctrl.create);
router.get('/', ctrl.list);
router.get('/:id', validate({ params: idParams }), ctrl.getOne);

export default router;
