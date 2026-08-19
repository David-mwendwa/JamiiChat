import Block from '../models/blockModel.js';
import Mute from '../models/muteModel.js';
import Follow from '../models/followModel.js';
import { UnauthorizedError, NotFoundError } from '../errors/customErrors.js';

// One gate, composed by every read path.
//
// Blocking, muting and private accounts have to be enforced on the feed, on
// profiles, on search, on notifications, on mentions, on direct messages and
// on single-post pages. Enforced ad hoc at each call site, one gets forgotten —
// and a forgotten one is a privacy failure, not a display glitch. So every
// query that can surface another user's content asks this module first.

// Blocking is symmetric: neither side sees the other. Storing only one row
// means the lookup has to check both columns, which is the half that is easy
// to get wrong.
export const blockedIds = async (viewerId) => {
  if (!viewerId) return [];
  const rows = await Block.find({ $or: [{ blocker: viewerId }, { blocked: viewerId }] })
    .select('blocker blocked')
    .lean();
  const ids = new Set();
  for (const row of rows) {
    ids.add(String(row.blocker) === String(viewerId) ? String(row.blocked) : String(row.blocker));
  }
  return [...ids];
};

// Muting is one-directional and only hides timeline content — a muted account
// can still be visited deliberately, and still receives your replies.
export const mutedIds = async (viewerId) => {
  if (!viewerId) return [];
  const rows = await Mute.find({ muter: viewerId }).select('muted').lean();
  return rows.map((r) => String(r.muted));
};

export const followingIds = async (viewerId) => {
  if (!viewerId) return [];
  const rows = await Follow.find({ follower: viewerId, status: 'accepted' })
    .select('following')
    .lean();
  return rows.map((r) => String(r.following));
};

// The id sets a feed query needs, fetched in one round trip.
export const viewerScope = async (viewerId) => {
  const [blocked, muted, following] = await Promise.all([
    blockedIds(viewerId),
    mutedIds(viewerId),
    followingIds(viewerId),
  ]);
  // A blocked account's posts are hidden even if a stale follow edge survives.
  const blockedSet = new Set(blocked);
  return {
    blocked,
    muted,
    following: following.filter((id) => !blockedSet.has(id)),
    // Muted accounts are excluded from timelines but not from a profile page,
    // so the two lists stay separate rather than being merged here.
    hiddenFromTimeline: [...new Set([...blocked, ...muted])],
  };
};

export const isBlockedBetween = async (a, b) => {
  if (!a || !b || String(a) === String(b)) return false;
  const row = await Block.findOne({
    $or: [
      { blocker: a, blocked: b },
      { blocker: b, blocked: a },
    ],
  }).lean();
  return Boolean(row);
};

export const isFollowing = async (viewerId, targetId) => {
  if (!viewerId) return false;
  const row = await Follow.findOne({ follower: viewerId, following: targetId }).lean();
  return row?.status === 'accepted';
};

export const followState = async (viewerId, targetId) => {
  if (!viewerId || String(viewerId) === String(targetId)) return 'self';
  const row = await Follow.findOne({ follower: viewerId, following: targetId }).lean();
  if (!row) return 'none';
  return row.status === 'pending' ? 'requested' : 'following';
};

// The list version of `followState`, for a page of results rather than one
// profile — one query for the whole page instead of one per row, which a
// followers/following list of 20 people would otherwise turn into 20 round
// trips.
export const followStates = async (viewerId, targetIds) => {
  const states = new Map(targetIds.map((id) => [String(id), 'none']));
  if (!viewerId) return states;

  const rows = await Follow.find({
    follower: viewerId,
    following: { $in: targetIds },
  })
    .select('following status')
    .lean();

  for (const row of rows) {
    const id = String(row.following);
    if (id === String(viewerId)) continue;
    states.set(id, row.status === 'pending' ? 'requested' : 'following');
  }
  if (states.has(String(viewerId))) states.set(String(viewerId), 'self');
  return states;
};

// Can this viewer read this author's content? Public accounts are open;
// private ones need an accepted follow. The author always sees their own.
export const canViewAuthor = async (viewer, author) => {
  const viewerId = viewer?._id ? String(viewer._id) : null;
  const authorId = String(author._id ?? author);

  if (viewerId === authorId) return true;
  if (await isBlockedBetween(viewerId, authorId)) return false;
  if (!author.isPrivate) return true;
  if (!viewerId) return false;
  return isFollowing(viewerId, authorId);
};

// Throws rather than returns, for the single-resource routes. A post the viewer
// may not read reports as missing rather than forbidden, so the response does
// not confirm that a private account posted something.
export const assertCanViewPost = async (viewer, post) => {
  const author = post.author;
  if (!author) throw new NotFoundError('That post is not available');
  if (!(await canViewAuthor(viewer, author)))
    throw new NotFoundError('That post is not available');
  return true;
};

export const assertNotBlocked = async (a, b, message = 'That action is not available') => {
  if (await isBlockedBetween(a, b)) throw new UnauthorizedError(message);
};
