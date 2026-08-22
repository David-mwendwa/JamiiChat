import { StatusCodes } from 'http-status-codes';
import mongoose from 'mongoose';
import User from '../models/userModel.js';
import Follow from '../models/followModel.js';
import Block from '../models/blockModel.js';
import Mute from '../models/muteModel.js';
import { NotFoundError, BadRequestError, UnauthorizedError } from '../errors/customErrors.js';
import { followState, followStates, canViewAuthor, isBlockedBetween, viewerScope } from '../services/visibility.js';
import { notify, removeNotification } from '../services/notify.js';
import { processImage, uploadSingle, deleteStoredFile } from '../middleware/upload.js';
import { clampLimit, paginate, cursorFilter, decodeCursor } from '../utils/cursor.js';
import { escapeRegex } from '../utils/text.js';
import { authorFeed } from '../services/feed.js';
import { isOnline } from '../socket/emit.js';

const findByHandle = async (handle) => {
  const user = await User.findOne({ handle: String(handle).toLowerCase() });
  if (!user) throw new NotFoundError('No account with that username');
  return user;
};

export const getProfile = async (req, res) => {
  const user = await findByHandle(req.params.handle);

  if (await isBlockedBetween(req.user?._id, user._id))
    throw new NotFoundError('No account with that username');

  const [relationship, viewable] = await Promise.all([
    followState(req.user?._id, user._id),
    canViewAuthor(req.user, user),
  ]);

  const muted = req.user
    ? Boolean(await Mute.exists({ muter: req.user._id, muted: user._id }))
    : false;

  res.status(StatusCodes.OK).json({
    status: 'success',
    user: {
      ...user.toPublic(),
      relationship,
      muted,
      online: isOnline(user._id),
      lastSeenAt: user.lastSeenAt,
      // A private account still shows its header — name, bio, counts — but not
      // its posts. Hiding the profile entirely would make it impossible to
      // request a follow.
      canViewPosts: viewable,
    },
  });
};

export const getProfilePosts = async (req, res) => {
  const user = await findByHandle(req.params.handle);

  if (!(await canViewAuthor(req.user, user)))
    return res
      .status(StatusCodes.OK)
      .json({ status: 'success', locked: true, items: [], nextCursor: null });

  const { items, nextCursor } = await authorFeed({
    viewer: req.user,
    authorId: user._id,
    cursor: req.query.cursor,
    limit: clampLimit(req.query.limit),
    includeReplies: req.query.replies === 'true',
  });

  res.status(StatusCodes.OK).json({ status: 'success', items, nextCursor });
};

export const updateMe = async (req, res) => {
  // An allowlist, not a blocklist: a body carrying `role` or `counts` must not
  // be able to write them just because a new field was added to the schema.
  const allowed = ['displayName', 'bio', 'location', 'website', 'isPrivate'];
  const updates = {};
  for (const key of allowed) if (key in req.body) updates[key] = req.body[key];

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  });

  res.status(StatusCodes.OK).json({ status: 'success', user: user.toPrivate() });
};

export const updateHandle = async (req, res) => {
  const handle = String(req.body.handle ?? '').toLowerCase().trim();
  if (!handle) throw new BadRequestError('Pick a username');

  const user = await User.findById(req.user._id);
  user.handle = handle;
  await user.save();

  res.status(StatusCodes.OK).json({ status: 'success', user: user.toPrivate() });
};

export const uploadAvatar = [
  uploadSingle('image'),
  async (req, res) => {
    if (!req.file) throw new BadRequestError('Choose an image first');
    const kind = req.params.kind === 'cover' ? 'cover' : 'avatar';
    const { url } = await processImage(req.file.buffer, kind);

    const previous = req.user[kind];
    const user = await User.findByIdAndUpdate(req.user._id, { [kind]: url }, { new: true });
    if (previous && previous !== url) deleteStoredFile(previous);
    res.status(StatusCodes.OK).json({ status: 'success', user: user.toPrivate() });
  },
];

// A blank `avatar`/`cover` isn't a missing image — Avatar.jsx (and the cover
// slot) already render an initials/gradient placeholder for an empty string,
// same as a brand-new account that never uploaded one. This exists so an
// uploaded photo that has stopped resolving has a way back to that
// placeholder instead of sitting as a permanently broken `<img>`.
export const removeImage = async (req, res) => {
  const kind = req.params.kind === 'cover' ? 'cover' : 'avatar';
  const previous = req.user[kind];
  const user = await User.findByIdAndUpdate(req.user._id, { [kind]: '' }, { new: true });
  if (previous) deleteStoredFile(previous);
  res.status(StatusCodes.OK).json({ status: 'success', user: user.toPrivate() });
};

export const follow = async (req, res) => {
  const target = await findByHandle(req.params.handle);
  if (String(target._id) === String(req.user._id))
    throw new BadRequestError('You cannot follow yourself');

  if (await isBlockedBetween(req.user._id, target._id))
    throw new UnauthorizedError('That account is not available');

  const status = target.isPrivate ? 'pending' : 'accepted';

  // Checked before creating the new edge: "they followed you back" is a
  // materially different notification than "you have a new follower" — it
  // tells the recipient their earlier follow was reciprocated, not that a
  // stranger showed up.
  const isBack =
    status === 'accepted' &&
    Boolean(await Follow.exists({ follower: target._id, following: req.user._id, status: 'accepted' }));

  // The unique index on {follower, following} makes a double-follow a duplicate
  // key error rather than a race between two clicks, so the counter increment
  // below can be trusted to run exactly once.
  try {
    await Follow.create({ follower: req.user._id, following: target._id, status });
  } catch (err) {
    if (err.code === 11000) {
      const existing = await Follow.findOne({ follower: req.user._id, following: target._id });
      return res
        .status(StatusCodes.OK)
        .json({ status: 'success', relationship: existing.status === 'pending' ? 'requested' : 'following' });
    }
    throw err;
  }

  if (status === 'accepted') {
    await Promise.all([
      User.updateOne({ _id: target._id }, { $inc: { 'counts.followers': 1 } }),
      User.updateOne({ _id: req.user._id }, { $inc: { 'counts.following': 1 } }),
    ]);
  }

  await notify({
    recipientId: target._id,
    actorId: req.user._id,
    type: status === 'pending' ? 'follow_request' : isBack ? 'follow_back' : 'follow',
  });

  res.status(StatusCodes.OK).json({
    status: 'success',
    relationship: status === 'pending' ? 'requested' : 'following',
  });
};

export const unfollow = async (req, res) => {
  const target = await findByHandle(req.params.handle);
  const removed = await Follow.findOneAndDelete({
    follower: req.user._id,
    following: target._id,
  });

  // Counters only move for edges that were actually counted — a withdrawn
  // pending request never incremented anything.
  if (removed && removed.status === 'accepted') {
    await Promise.all([
      User.updateOne({ _id: target._id }, { $inc: { 'counts.followers': -1 } }),
      User.updateOne({ _id: req.user._id }, { $inc: { 'counts.following': -1 } }),
    ]);
  }

  if (removed)
    await removeNotification({
      recipientId: target._id,
      actorId: req.user._id,
      type: removed.status === 'pending' ? 'follow_request' : 'follow',
    });

  res.status(StatusCodes.OK).json({ status: 'success', relationship: 'none' });
};

export const respondToRequest = async (req, res) => {
  const { handle } = req.params;
  const accept = req.body.accept !== false;
  const requester = await findByHandle(handle);

  const request = await Follow.findOne({
    follower: requester._id,
    following: req.user._id,
    status: 'pending',
  });
  if (!request) throw new NotFoundError('There is no pending request from that account');

  if (accept) {
    request.status = 'accepted';
    await request.save();
    await Promise.all([
      User.updateOne({ _id: req.user._id }, { $inc: { 'counts.followers': 1 } }),
      User.updateOne({ _id: requester._id }, { $inc: { 'counts.following': 1 } }),
    ]);
    await notify({ recipientId: requester._id, actorId: req.user._id, type: 'follow' });
  } else {
    await request.deleteOne();
  }

  await removeNotification({
    recipientId: req.user._id,
    actorId: requester._id,
    type: 'follow_request',
  });

  res.status(StatusCodes.OK).json({ status: 'success', accepted: accept });
};

const relationList = async (req, res, field, otherField) => {
  const user = await findByHandle(req.params.handle);
  if (!(await canViewAuthor(req.user, user)))
    return res.status(StatusCodes.OK).json({ status: 'success', locked: true, items: [], nextCursor: null });

  const limit = clampLimit(req.query.limit);
  const filter = {
    [field]: user._id,
    status: 'accepted',
    ...cursorFilter(decodeCursor(req.query.cursor)),
  };

  const { items, nextCursor } = await paginate(
    Follow.find(filter).populate(otherField, 'handle displayName avatar bio isPrivate').lean(),
    { cursor: req.query.cursor, limit }
  );

  const people = items.map((row) => row[otherField]).filter(Boolean);
  const relationships = await followStates(
    req.user?._id,
    people.map((p) => p._id)
  );

  res.status(StatusCodes.OK).json({
    status: 'success',
    items: people.map((p) => ({
      ...p,
      id: p._id,
      relationship: relationships.get(String(p._id)) ?? 'none',
    })),
    nextCursor,
  });
};

export const listFollowers = (req, res) => relationList(req, res, 'following', 'follower');
export const listFollowing = (req, res) => relationList(req, res, 'follower', 'following');

export const listRequests = async (req, res) => {
  const rows = await Follow.find({ following: req.user._id, status: 'pending' })
    .populate('follower', 'handle displayName avatar bio')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  res
    .status(StatusCodes.OK)
    .json({ status: 'success', items: rows.map((r) => r.follower).filter(Boolean) });
};

export const blockUser = async (req, res) => {
  const target = await findByHandle(req.params.handle);
  if (String(target._id) === String(req.user._id))
    throw new BadRequestError('You cannot block yourself');

  await Block.updateOne(
    { blocker: req.user._id, blocked: target._id },
    { $setOnInsert: { blocker: req.user._id, blocked: target._id } },
    { upsert: true }
  );

  // A block severs the relationship in both directions, so any existing follow
  // edges go with it — otherwise the blocked account keeps appearing in
  // follower counts and the blocker's posts keep reaching their timeline.
  const removed = await Follow.find({
    $or: [
      { follower: req.user._id, following: target._id },
      { follower: target._id, following: req.user._id },
    ],
    status: 'accepted',
  }).lean();

  await Follow.deleteMany({
    $or: [
      { follower: req.user._id, following: target._id },
      { follower: target._id, following: req.user._id },
    ],
  });

  for (const edge of removed) {
    await Promise.all([
      User.updateOne({ _id: edge.following }, { $inc: { 'counts.followers': -1 } }),
      User.updateOne({ _id: edge.follower }, { $inc: { 'counts.following': -1 } }),
    ]);
  }

  res.status(StatusCodes.OK).json({ status: 'success', blocked: true });
};

export const unblockUser = async (req, res) => {
  const target = await findByHandle(req.params.handle);
  await Block.deleteOne({ blocker: req.user._id, blocked: target._id });
  res.status(StatusCodes.OK).json({ status: 'success', blocked: false });
};

export const muteUser = async (req, res) => {
  const target = await findByHandle(req.params.handle);
  if (String(target._id) === String(req.user._id))
    throw new BadRequestError('You cannot mute yourself');
  await Mute.updateOne(
    { muter: req.user._id, muted: target._id },
    { $setOnInsert: { muter: req.user._id, muted: target._id } },
    { upsert: true }
  );
  res.status(StatusCodes.OK).json({ status: 'success', muted: true });
};

export const unmuteUser = async (req, res) => {
  const target = await findByHandle(req.params.handle);
  await Mute.deleteOne({ muter: req.user._id, muted: target._id });
  res.status(StatusCodes.OK).json({ status: 'success', muted: false });
};

export const listBlocked = async (req, res) => {
  const rows = await Block.find({ blocker: req.user._id })
    .populate('blocked', 'handle displayName avatar')
    .lean();
  res
    .status(StatusCodes.OK)
    .json({ status: 'success', items: rows.map((r) => r.blocked).filter(Boolean) });
};

// The full member directory — everyone, not just accounts you don't already
// follow (that's `suggestions`, a discovery widget with a different job).
// Cursor-paginated like every other list here, with an optional `q` that
// narrows it to a handle/name match rather than requiring a separate search
// page for "is there anyone called...".
export const listUsers = async (req, res) => {
  const scope = await viewerScope(req.user._id);
  const excluded = [
    new mongoose.Types.ObjectId(String(req.user._id)),
    ...scope.blocked.map((id) => new mongoose.Types.ObjectId(id)),
  ];

  const q = String(req.query.q ?? '').trim();
  const limit = clampLimit(req.query.limit);

  const filter = { _id: { $nin: excluded }, active: { $ne: false } };

  // Combined with `$and` rather than a second top-level `$or` key — the
  // cursor's own `$or` (createdAt/_id tiebreak) would otherwise be silently
  // overwritten by a search `$or` added the same way, and only one of the
  // two conditions would actually apply.
  const clauses = [];
  const cursorClause = cursorFilter(decodeCursor(req.query.cursor));
  if (cursorClause.$or) clauses.push(cursorClause);
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    const barePattern = new RegExp(`^${escapeRegex(q.replace(/^@/, ''))}`, 'i');
    clauses.push({ $or: [{ handle: barePattern }, { displayName: pattern }] });
  }
  if (clauses.length) filter.$and = clauses;

  const { items, nextCursor } = await paginate(User.find(filter).lean(), {
    cursor: req.query.cursor,
    limit,
  });

  const relationships = await followStates(req.user._id, items.map((u) => u._id));

  res.status(StatusCodes.OK).json({
    status: 'success',
    items: items.map((u) => ({
      id: u._id,
      handle: u.handle,
      displayName: u.displayName,
      avatar: u.avatar,
      bio: u.bio,
      counts: u.counts,
      relationship: relationships.get(String(u._id)) ?? 'none',
    })),
    nextCursor,
  });
};

// Accounts the viewer does not follow, ranked by follower count. Deliberately
// simple: a real recommender needs signals this app does not collect, and a
// fake one that pretends to be smart is worse than an honest popular list.
export const suggestions = async (req, res) => {
  const scope = await viewerScope(req.user._id);
  const exclude = [
    new mongoose.Types.ObjectId(String(req.user._id)),
    ...[...scope.following, ...scope.blocked].map((id) => new mongoose.Types.ObjectId(id)),
  ];

  const users = await User.find({ _id: { $nin: exclude }, active: { $ne: false } })
    .sort({ 'counts.followers': -1, createdAt: -1 })
    .limit(clampLimit(req.query.limit, 5))
    .lean();

  res.status(StatusCodes.OK).json({
    status: 'success',
    items: users.map((u) => ({
      id: u._id,
      handle: u.handle,
      displayName: u.displayName,
      avatar: u.avatar,
      bio: u.bio,
      counts: u.counts,
    })),
  });
};
