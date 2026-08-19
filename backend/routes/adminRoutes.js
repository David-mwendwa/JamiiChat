import { Router } from 'express';
import { protect, restrictTo } from '../middleware/auth.js';
import {
  overview,
  listReports,
  resolveReport,
  listUsers,
  setUserActive,
} from '../controllers/adminController.js';

const router = Router();

router.use(protect, restrictTo('admin', 'moderator'));

router.get('/overview', overview);
router.get('/reports', listReports);
router.patch('/reports/:id', resolveReport);
router.get('/users', listUsers);
router.patch('/users/:id/active', setUserActive);

export default router;
