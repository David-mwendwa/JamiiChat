import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  listNotifications,
  getUnreadCount,
  markAllRead,
  markOneRead,
} from '../controllers/notificationController.js';

const router = Router();

router.use(protect);

router.get('/', listNotifications);
router.get('/unread', getUnreadCount);
router.patch('/read', markAllRead);
router.patch('/:id/read', markOneRead);

export default router;
