import { StatusCodes } from 'http-status-codes';
import User from '../models/userModel.js';
import { signToken, cookieOptions } from '../utils/token.js';
import { BadRequestError, UnauthenticatedError } from '../errors/customErrors.js';
import { people, demoAccounts } from '../data/seedContent.js';
import { isReservedHandle } from '../utils/reservedHandles.js';

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
