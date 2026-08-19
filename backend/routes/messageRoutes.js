import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  listConversations,
  openConversation,
  listMessages,
  sendMessage,
  markRead,
  unreadTotal,
  editMessage,
  deleteMessage,
  hideMessage,
  hideConversation,
} from '../controllers/messageController.js';

const router = Router();

router.use(protect);

router.get('/', listConversations);
router.get('/unread', unreadTotal);
router.post('/with/:handle', openConversation);
router.post('/:id/hide', hideConversation);
router.get('/:id/messages', listMessages);
router.post('/:id/messages', sendMessage);
router.patch('/:id/messages/:messageId', editMessage);
router.delete('/:id/messages/:messageId', deleteMessage);
router.post('/:id/messages/:messageId/hide', hideMessage);
router.patch('/:id/read', markRead);

export default router;
