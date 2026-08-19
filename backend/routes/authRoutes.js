import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  register,
  login,
  logout,
  me,
  updatePassword,
  checkHandle,
  listTestAccounts,
  forgotPassword,
  resetPassword,
} from '../controllers/authController.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/handle-available', checkHandle);
router.get('/test-accounts', listTestAccounts);
router.post('/password/forgot', forgotPassword);
router.patch('/password/reset/:token', resetPassword);

router.get('/me', protect, me);
router.patch('/password', protect, updatePassword);

export default router;
