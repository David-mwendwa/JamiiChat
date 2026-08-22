import { StatusCodes } from 'http-status-codes';
import mongoose from 'mongoose';
import User from '../models/userModel.js';
import Post from '../models/postModel.js';
import { viewerScope, followStates } from '../services/visibility.js';
import { hydratePosts, postPopulate } from '../services/feed.js';
import { clampLimit } from '../utils/cursor.js';
import { escapeRegex } from '../utils/text.js';

export const search = async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const limit = clampLimit(req.query.limit, 10);

  if (q.length < 2)
    return res
      .status(StatusCodes.OK)
      .json({ status: 'success', users: [], posts: [], hashtags: [] });

  const scope = req.user ? await viewerScope(req.user._id) : { blocked: [], hiddenFromTimeline: [] };
  const hidden = scope.blocked.map((id) => new mongoose.Types.ObjectId(id));
  const hiddenTimeline = scope.hiddenFromTimeline.map((id) => new mongoose.Types.ObjectId(id));

  const pattern = new RegExp(escapeRegex(q), 'i');
  const bare = q.replace(/^[#@]/, '');
  const barePattern = new RegExp(`^${escapeRegex(bare)}`, 'i');

  const [users, posts, hashtags] = await Promise.all([
    User.find({
      _id: { $nin: hidden },
      active: { $ne: false },
      $or: [{ handle: barePattern }, { displayName: pattern }],
    })
      .sort({ 'counts.followers': -1 })
      .limit(limit)
      .lean(),

    Post.find({
      deletedAt: null,
      replyTo: null,
      author: { $nin: hiddenTimeline },
      text: pattern,
    })
      .populate(postPopulate)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),

    Post.aggregate([
      { $match: { deletedAt: null, hashtags: barePattern } },
      { $unwind: '$hashtags' },
      { $match: { hashtags: barePattern } },
      { $group: { _id: '$hashtags', posts: { $sum: 1 } } },
      { $sort: { posts: -1 } },
      { $limit: limit },
    ]),
  ]);

  const relationships = await followStates(
    req.user?._id,
    users.map((u) => u._id)
  );

  res.status(StatusCodes.OK).json({
    status: 'success',
    users: users.map((u) => ({
      id: u._id,
      handle: u.handle,
      displayName: u.displayName,
      avatar: u.avatar,
      bio: u.bio,
      counts: u.counts,
      relationship: relationships.get(String(u._id)) ?? 'none',
    })),
    posts: await hydratePosts(posts, req.user?._id),
    hashtags: hashtags.map((h) => ({ tag: h._id, posts: h.posts })),
  });
};

// Tags used most in the recent window. A tag that was huge last month is not
// trending, so the window matters more than the raw total — but on a network
// this size a 48-hour window is mostly empty, which makes a working feature
// look broken. Seven days is the honest setting for the current volume.
const TRENDING_WINDOW_DAYS = 7;

export const trending = async (req, res) => {
  const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const rows = await Post.aggregate([
    { $match: { deletedAt: null, createdAt: { $gte: since }, hashtags: { $ne: [] } } },
    { $unwind: '$hashtags' },
    { $group: { _id: '$hashtags', posts: { $sum: 1 }, engagement: { $sum: '$counts.likes' } } },
    { $sort: { posts: -1, engagement: -1 } },
    { $limit: clampLimit(req.query.limit, 6) },
  ]);

  res.status(StatusCodes.OK).json({
    status: 'success',
    items: rows.map((r) => ({ tag: r._id, posts: r.posts })),
  });
};
