import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { createReport } from '../controllers/reportController.js';

const router = Router();

router.post('/', protect, createReport);

export default router;
