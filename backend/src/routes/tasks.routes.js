import { Router } from 'express';
import * as ctrl from '../controllers/tasks.controller.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../schemas/employee.schema.js';
import { createTaskBody, listTasksQuery, patchTaskBody, statusBody } from '../schemas/task.schema.js';

const router = Router();

router.get('/', validate({ query: listTasksQuery }), ctrl.list);
router.post('/', requireRole('hr'), validate({ body: createTaskBody }), ctrl.create);
router.patch('/:id/status', validate({ params: idParams, body: statusBody }), ctrl.updateStatus);
router.post('/:id/confirm', requireRole('hr'), validate({ params: idParams }), ctrl.confirm);
router.patch('/:id', requireRole('hr'), validate({ params: idParams, body: patchTaskBody }), ctrl.patch);
router.delete('/:id', requireRole('hr'), validate({ params: idParams }), ctrl.remove);

export default router;
