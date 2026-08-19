import { Router } from 'express';
import { protect, optionalAuth } from '../middleware/auth.js';
import { getHomeFeed, getExploreFeed, getHashtagFeed } from '../controllers/feedController.js';

const router = Router();

// Home needs an identity — it is defined by who you follow. Explore and tag
// feeds render for a logged-out reader, just without like state.
router.get('/home', protect, getHomeFeed);
router.get('/explore', optionalAuth, getExploreFeed);
router.get('/tag/:tag', optionalAuth, getHashtagFeed);

export default router;
