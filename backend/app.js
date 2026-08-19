import 'express-async-errors';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { UnauthorizedError } from './errors/customErrors.js';
import helmet from 'helmet';
import hpp from 'hpp';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';

import sanitizeBody from './middleware/sanitizeBody.js';
import notFound from './middleware/notFound.js';
import errorHandler from './middleware/errorHandler.js';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import postRoutes from './routes/postRoutes.js';
import feedRoutes from './routes/feedRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

export const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.PROD_FRONTEND_URL,
  !isProduction && 'http://localhost:5012',
].filter(Boolean);

const app = express();
app.set('trust proxy', 1);

app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      // Requests with no Origin header (curl, health checks) pass through.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      // A typed error, not a bare one: a bare Error falls through to the
      // handler's catch-all, which answers 500 and console.errors a full
      // stack. A refused origin is an expected outcome, not a server fault —
      // and logging a trace for each one makes blocked traffic a way to flood
      // production logs.
      callback(new UnauthorizedError(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  })
);

if (!isProduction) app.use(morgan('dev'));

app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: true, limit: '64kb' }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(sanitizeBody);
app.use(hpp({ whitelist: ['tag', 'cursor'] }));

// Helmet's default Cross-Origin-Resource-Policy is same-origin, which would
// stop the frontend on its own port from loading any of these images. Widened
// here only, rather than turning the protection off across the whole app.
app.use(
  '/media',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(path.join(__dirname, 'public/media'), { maxAge: '30d' })
);

app.get('/health', (req, res) =>
  res.status(200).json({ status: 'ok', uptime: process.uptime() })
);

app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: isProduction ? 600 : 5000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { status: 'fail', message: 'Too many requests. Try again in a few minutes.' },
  })
);

// Auth is limited far harder than everything else, and successful attempts do
// not count — the limit exists to stop password guessing, not to lock out
// someone who keeps signing in from a shared network.
app.use(
  '/api/v1/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: isProduction ? 20 : 500,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { status: 'fail', message: 'Too many attempts. Try again in a few minutes.' },
  })
);

// Posting is the cheapest way to spam a social app, so writes get their own
// budget independent of reads.
app.use(
  ['/api/v1/posts', '/api/v1/reports'],
  rateLimit({
    windowMs: 60 * 1000,
    limit: isProduction ? 20 : 300,
    skipFailedRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { status: 'fail', message: 'You are posting too quickly. Slow down a moment.' },
  })
);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/posts', postRoutes);
app.use('/api/v1/feed', feedRoutes);
app.use('/api/v1/conversations', messageRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
