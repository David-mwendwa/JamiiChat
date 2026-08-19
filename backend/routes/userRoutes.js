import { Router } from 'express';
import { protect, optionalAuth } from '../middleware/auth.js';
import {
  getProfile,
  getProfilePosts,
  updateMe,
  updateHandle,
  uploadAvatar,
  follow,
  unfollow,
  respondToRequest,
  listFollowers,
  listFollowing,
  listRequests,
  blockUser,
  unblockUser,
  muteUser,
  unmuteUser,
  listBlocked,
  suggestions,
} from '../controllers/userController.js';

const router = Router();

// Fixed segments are declared before `/:handle`, or a request for
// /users/suggestions resolves as a profile lookup for someone called
// "suggestions".
router.get('/suggestions', protect, suggestions);
router.get('/requests', protect, listRequests);
router.get('/blocked', protect, listBlocked);

router.patch('/me', protect, updateMe);
router.patch('/me/handle', protect, updateHandle);
router.patch('/me/image/:kind', protect, uploadAvatar);

router.get('/:handle', optionalAuth, getProfile);
router.get('/:handle/posts', optionalAuth, getProfilePosts);
router.get('/:handle/followers', optionalAuth, listFollowers);
router.get('/:handle/following', optionalAuth, listFollowing);

router.post('/:handle/follow', protect, follow);
router.delete('/:handle/follow', protect, unfollow);
router.post('/:handle/respond', protect, respondToRequest);

router.post('/:handle/block', protect, blockUser);
router.delete('/:handle/block', protect, unblockUser);
router.post('/:handle/mute', protect, muteUser);
router.delete('/:handle/mute', protect, unmuteUser);

export default router;
