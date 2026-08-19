import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { search, trending } from '../controllers/searchController.js';

const router = Router();

router.get('/', optionalAuth, search);
router.get('/trending', optionalAuth, trending);

export default router;
