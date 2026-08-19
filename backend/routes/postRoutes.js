import { Router } from 'express';
import { protect, optionalAuth } from '../middleware/auth.js';
import {
  createPost,
  getPost,
  getReplies,
  deletePost,
  likePost,
  unlikePost,
  repost,
  undoRepost,
  bookmark,
  unbookmark,
  listBookmarks,
  listLikers,
} from '../controllers/postController.js';

const router = Router();

router.get('/bookmarks', protect, listBookmarks);

router.post('/', protect, createPost);
router.get('/:id', optionalAuth, getPost);
router.delete('/:id', protect, deletePost);

router.get('/:id/replies', optionalAuth, getReplies);
router.get('/:id/likes', optionalAuth, listLikers);

router.post('/:id/like', protect, likePost);
router.delete('/:id/like', protect, unlikePost);

router.post('/:id/repost', protect, repost);
router.delete('/:id/repost', protect, undoRepost);

router.post('/:id/bookmark', protect, bookmark);
router.delete('/:id/bookmark', protect, unbookmark);

export default router;
