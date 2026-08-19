import User from '../models/userModel.js';
import { extractToken, verifyToken } from '../utils/token.js';
import { UnauthenticatedError, UnauthorizedError } from '../errors/customErrors.js';

// Loads the user behind a verified token, or returns null. Shared by the three
// guards below and by the socket handshake, so a suspended account loses HTTP
// and WebSocket access at the same moment.
export const userFromToken = async (token) => {
  if (!token) return null;
  const payload = verifyToken(token);
  const user = await User.findById(payload.id).select('+active');
  if (!user || user.active === false) return null;
  if (user.passwordChangedAfter(payload.iat)) return null;
  if (user.suspendedUntil && user.suspendedUntil > new Date()) return null;
  return user;
};

export const protect = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw new UnauthenticatedError('Log in to continue');

  const user = await userFromToken(token);
  if (!user) throw new UnauthenticatedError('Your session is no longer valid. Log in again.');

  req.user = user;
  next();
};

// Populates req.user when a token is present but never rejects. Public
// profiles and posts need this: the response includes "are you following this
// person" and "have you liked this", which are meaningless without a viewer,
// but the page still has to render for a logged-out reader.
export const optionalAuth = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const user = await userFromToken(token);
    if (user) req.user = user;
  } catch {
    // An invalid token is the same as no token on a public route.
  }
  next();
};

export const restrictTo =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user.role))
      throw new UnauthorizedError('You do not have permission to do that');
    next();
  };
