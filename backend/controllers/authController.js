import crypto from 'crypto';
import { StatusCodes } from 'http-status-codes';
import User from '../models/userModel.js';
import { signToken, cookieOptions } from '../utils/token.js';
import { BadRequestError, UnauthenticatedError, InternalServerError } from '../errors/customErrors.js';
import { people, demoAccounts } from '../data/seedContent.js';
import { isReservedHandle } from '../utils/reservedHandles.js';
import { mailConfigured, sendTemplate } from '../utils/mailer.js';
import { passwordReset } from '../utils/emailTemplates.js';

// The token is set as an httpOnly cookie and also returned in the body: the
// cookie carries normal navigation, and the body value is what the WebSocket
// handshake sends, since a cookie is not available to the socket client on a
// cross-origin connection.
const sendAuth = (res, user, statusCode = StatusCodes.OK) => {
  const token = signToken(user._id);
  res.cookie('token', token, cookieOptions());
  res.status(statusCode).json({ status: 'success', token, user: user.toPrivate() });
};

export const register = async (req, res) => {
  const { handle, displayName, email, password } = req.body;
  if (!handle || !displayName || !email || !password)
    throw new BadRequestError('Username, name, email and password are all required');

  const user = await User.create({ handle, displayName, email, password });
  sendAuth(res, user, StatusCodes.CREATED);
};

export const login = async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password)
    throw new BadRequestError('Enter your username or email, and your password');

  // Accepts either a handle or an email, so nobody has to remember which they
  // signed up with.
  const query = identifier.includes('@')
    ? { email: identifier.toLowerCase().trim() }
    : { handle: identifier.toLowerCase().trim() };

  const user = await User.findOne(query).select('+password +active');

  // One message for both branches: distinguishing "no such user" from "wrong
  // password" tells an attacker which handles exist.
  if (!user || !(await user.matchesPassword(password)))
    throw new UnauthenticatedError('That username or password is not right');

  if (user.active === false) throw new UnauthenticatedError('This account has been deactivated');

  sendAuth(res, user);
};

/**
 * ## Password reset
 *
 * Two things this deliberately gets right that are easy to get wrong:
 *
 *  - An unknown address gets the same response as a known one. A form that
 *    answers differently is a way to test which emails have accounts here.
 *  - The reset link points at the frontend route (`/password/reset/:token`),
 *    not at this API — the token is only useful once someone can paste a new
 *    password next to it, and that page lives in the React app.
 */

// forgot password => POST /api/v1/auth/password/forgot
export const forgotPassword = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = await User.findOne({ email });

  const genericResponse = {
    status: 'success',
    message: 'If that email has an account, a reset link is on its way. Check your inbox and your spam folder.',
  };

  if (!user) {
    return res.status(StatusCodes.OK).json(genericResponse);
  }

  const resetToken = user.getResetPasswordToken();
  await user.save({ validateBeforeSave: false });

  const frontendUrl = process.env.PROD_FRONTEND_URL || process.env.FRONTEND_URL || 'http://localhost:5012';
  const resetUrl = `${frontendUrl}/password/reset/${resetToken}`;

  const result = await sendTemplate(user.email, passwordReset({ user, resetUrl }));

  if (result.delivered) {
    return res.status(StatusCodes.OK).json(genericResponse);
  }

  // Reset is the one flow with nothing to fall back on — the account is
  // locked out and the link is the entire remedy. Outside production it goes
  // to the server log and back in the response so the flow stays walkable
  // with no mail server configured at all. Never in production, where a
  // failed send has to stay a failure rather than handing a working reset
  // link to whoever asked for it.
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`Email not sent (${result.reason}). Password reset link: ${resetUrl}`);
    return res.status(StatusCodes.OK).json({
      ...genericResponse,
      devResetUrl: resetUrl,
      devNote: mailConfigured()
        ? `The mail server rejected the message (${result.reason}), so the link is returned here instead.`
        : 'No mail server is configured, so the link is returned here instead of emailed.',
    });
  }

  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save({ validateBeforeSave: false });
  throw new InternalServerError('Could not send the reset email. Please try again later.');
};

// reset password => PATCH /api/v1/auth/password/reset/:token
export const resetPassword = async (req, res) => {
  // The token in the link is the plain one; only its hash is stored.
  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() },
  }).select('+password');

  if (!user) {
    throw new BadRequestError('That reset link is invalid or has expired. Please request a new one.');
  }

  const { password, confirmPassword } = req.body;
  if (!password) throw new BadRequestError('Please choose a new password');
  if (password !== confirmPassword) throw new BadRequestError('Passwords do not match');

  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  // Signs them straight in — they've just proved control of the address.
  sendAuth(res, user);
};

export const logout = (req, res) => {
  res.cookie('token', '', { ...cookieOptions(), maxAge: 0 });
  res.status(StatusCodes.OK).json({ status: 'success', message: 'Signed out' });
};

export const me = async (req, res) => {
  res.status(StatusCodes.OK).json({ status: 'success', user: req.user.toPrivate() });
};

export const updatePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    throw new BadRequestError('Enter your current password and the new one');

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.matchesPassword(currentPassword)))
    throw new UnauthenticatedError('Your current password is not right');

  user.password = newPassword;
  await user.save();

  // Changing the password invalidates every previously issued token, including
  // the one that made this request, so a fresh one is returned.
  sendAuth(res, user);
};

export const checkHandle = async (req, res) => {
  const handle = String(req.query.handle ?? '').toLowerCase().trim();
  if (!handle) throw new BadRequestError('Provide a username to check');
  // Reads the same as "taken" to whoever is typing — the reason does not
  // change what they need to do next, which is pick a different name.
  const taken = isReservedHandle(handle) || (await User.exists({ handle }));
  res.status(StatusCodes.OK).json({ status: 'success', available: !taken });
};

// An explicit allowlist of seeded handles, not "every account in the
// database" — a real signup made after launch must never show up in a public
// directory of one-click test logins just because it exists in the users
// collection. `demo` and `admin` are listed first since they are the ones
// worth trying before anyone else.
const SEED_HANDLES = [...demoAccounts.map((a) => a.handle), ...people.map((p) => p.handle)];

// The shared password every seeded person (other than demo/admin, who have
// their own) was created with in scripts/seed.js. Handing it back here is not
// a new disclosure — README.md already publishes this exact convention
// (`<handle>@jamii.app` / `jamii12345`) so a reader can sign in as anyone
// seeded. This endpoint only automates typing it in.
const SEED_PASSWORD = 'jamii12345';

export const listTestAccounts = async (req, res) => {
  const users = await User.find({ handle: { $in: SEED_HANDLES } })
    .select('handle displayName avatar role')
    .lean();

  const byHandle = new Map(users.map((u) => [u.handle, u]));

  const items = SEED_HANDLES.map((handle) => byHandle.get(handle))
    .filter(Boolean)
    .map((u) => ({
      handle: u.handle,
      displayName: u.displayName,
      avatar: u.avatar,
      // Only demo/admin have a password worth remembering individually — every
      // other seeded person shares one, so the client only needs to know which
      // bucket a given handle falls into.
      password: demoAccounts.some((a) => a.handle === u.handle)
        ? demoAccounts.find((a) => a.handle === u.handle).password
        : SEED_PASSWORD,
    }));

  res.status(StatusCodes.OK).json({ status: 'success', items });
};
