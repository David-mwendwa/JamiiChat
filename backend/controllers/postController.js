import { StatusCodes } from 'http-status-codes';
import mongoose from 'mongoose';
import Post from '../models/postModel.js';
import User from '../models/userModel.js';
import Like from '../models/likeModel.js';
import Bookmark from '../models/bookmarkModel.js';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../errors/customErrors.js';
import { extractHashtags, extractHandles } from '../utils/text.js';
import { notify, removeNotification } from '../services/notify.js';
import { assertCanViewPost, canViewAuthor, isBlockedBetween } from '../services/visibility.js';
import { hydratePosts, postPopulate } from '../services/feed.js';
import { processImage, uploadMany } from '../middleware/upload.js';
import { clampLimit, paginate, cursorFilter, decodeCursor } from '../utils/cursor.js';
import { emitToUser } from '../socket/emit.js';

const MAX_DEPTH = 2;

const loadPost = async (id, { withAuthor = true } = {}) => {
  if (!mongoose.isValidObjectId(id)) throw new NotFoundError('That post does not exist');
  const query = Post.findOne({ _id: id, deletedAt: null });
  if (withAuthor) query.populate('author', 'handle displayName avatar isPrivate');
  const post = await query;
  if (!post) throw new NotFoundError('That post does not exist');
  return post;
};

const resolveMentions = async (text) => {
  const handles = extractHandles(text);
  if (handles.length === 0) return [];
  const users = await User.find({ handle: { $in: handles } }).select('_id').lean();
  return users.map((u) => u._id);
};

export const createPost = [
  uploadMany('images', 4),
  async (req, res) => {
    const text = String(req.body.text ?? '').trim();
    const replyTo = req.body.replyTo || null;

    const media = [];
    for (const file of req.files ?? []) media.push(await processImage(file.buffer, 'post'));

    let parent = null;
    let depth = 0;
    let rootPost = null;

    if (replyTo) {
      parent = await loadPost(replyTo);
      await assertCanViewPost(req.user, parent);
      await isBlockedBetween(req.user._id, parent.author._id).then((blocked) => {
        if (blocked) throw new UnauthorizedError('You cannot reply to that post');
      });

      // Depth is capped at 2. Deeper replies attach to their level-2 ancestor
      // and render flat, so a thread stays readable and loads with one query
      // instead of a recursive walk.
      depth = Math.min(parent.depth + 1, MAX_DEPTH);
      rootPost = parent.rootPost ?? parent._id;
      if (parent.depth >= MAX_DEPTH) {
        // Re-parent onto the deepest allowed ancestor rather than rejecting the
        // reply outright.
        parent = await Post.findById(parent.replyTo).populate('author', 'handle displayName avatar isPrivate');
        depth = MAX_DEPTH;
      }
    }

    const post = await Post.create({
      author: req.user._id,
      text,
      media,
      replyTo: parent?._id ?? null,
      rootPost,
      depth,
      hashtags: extractHashtags(text),
      mentions: await resolveMentions(text),
    });

    await User.updateOne({ _id: req.user._id }, { $inc: { 'counts.posts': 1 } });

    if (parent) {
      await Post.updateOne({ _id: parent._id }, { $inc: { 'counts.replies': 1 } });
      await notify({
        recipientId: parent.author._id,
        actorId: req.user._id,
        type: 'reply',
        postId: post._id,
      });
    }

    for (const mentioned of post.mentions) {
      await notify({ recipientId: mentioned, actorId: req.user._id, type: 'mention', postId: post._id });
    }

    const populated = await Post.findById(post._id).populate(postPopulate).lean();
    const [hydrated] = await hydratePosts([populated], req.user._id);

    res.status(StatusCodes.CREATED).json({ status: 'success', post: hydrated });
  },
];

export const getPost = async (req, res) => {
  const post = await loadPost(req.params.id);
  await assertCanViewPost(req.user, post);

  const populated = await Post.findById(post._id).populate(postPopulate).lean();
  const [hydrated] = await hydratePosts([populated], req.user?._id);

  // The ancestors of a reply, so a permalink shows the conversation it sits in
  // rather than a fragment with no context.
  const ancestors = [];
  let cursor = populated.replyTo;
  while (cursor && ancestors.length < MAX_DEPTH) {
    const parent = await Post.findOne({ _id: cursor, deletedAt: null })
      .populate(postPopulate)
      .lean();
    if (!parent) break;
    ancestors.unshift(parent);
    cursor = parent.replyTo;
  }

  res.status(StatusCodes.OK).json({
    status: 'success',
    post: hydrated,
    ancestors: await hydratePosts(ancestors, req.user?._id),
  });
};

export const getReplies = async (req, res) => {
  const post = await loadPost(req.params.id);
  await assertCanViewPost(req.user, post);

  const filter = {
    replyTo: post._id,
    deletedAt: null,
    ...cursorFilter(decodeCursor(req.query.cursor), 'asc'),
  };

  const { items, nextCursor } = await paginate(Post.find(filter).populate(postPopulate).lean(), {
    cursor: req.query.cursor,
    limit: clampLimit(req.query.limit),
    direction: 'asc',
  });

  res
    .status(StatusCodes.OK)
    .json({ status: 'success', items: await hydratePosts(items, req.user?._id), nextCursor });
};

export const deletePost = async (req, res) => {
  const post = await loadPost(req.params.id);

  const owns = String(post.author._id) === String(req.user._id);
  if (!owns && !['admin', 'moderator'].includes(req.user.role))
    throw new UnauthorizedError('You can only delete your own posts');

  // Soft delete: a removed post in the middle of a thread has to leave the
  // replies below it reachable.
  post.deletedAt = new Date();
  await post.save();

  await User.updateOne({ _id: post.author._id }, { $inc: { 'counts.posts': -1 } });
  if (post.replyTo) await Post.updateOne({ _id: post.replyTo }, { $inc: { 'counts.replies': -1 } });
  if (post.repostOf) await Post.updateOne({ _id: post.repostOf }, { $inc: { 'counts.reposts': -1 } });

  res.status(StatusCodes.OK).json({ status: 'success', message: 'Post deleted' });
};

export const likePost = async (req, res) => {
  const post = await loadPost(req.params.id);
  await assertCanViewPost(req.user, post);

  // Insert first, catch the duplicate, then increment. The unique index on
  // {post, user} is what makes a double-tap a no-op instead of a counter that
  // drifts upward by one every time.
  try {
    await Like.create({ user: req.user._id, post: post._id });
  } catch (err) {
    if (err.code === 11000)
      return res
        .status(StatusCodes.OK)
        .json({ status: 'success', liked: true, likes: post.counts.likes });
    throw err;
  }

  const updated = await Post.findByIdAndUpdate(
    post._id,
    { $inc: { 'counts.likes': 1 } },
    { new: true }
  );

  await notify({
    recipientId: post.author._id,
    actorId: req.user._id,
    type: 'like',
    postId: post._id,
  });

  // Everyone reading the post right now sees the count move.
  emitToUser(post.author._id, 'post:counts', {
    postId: String(post._id),
    counts: updated.counts,
  });

  res.status(StatusCodes.OK).json({ status: 'success', liked: true, likes: updated.counts.likes });
};

export const unlikePost = async (req, res) => {
  const post = await loadPost(req.params.id);
  const removed = await Like.findOneAndDelete({ user: req.user._id, post: post._id });

  if (!removed)
    return res
      .status(StatusCodes.OK)
      .json({ status: 'success', liked: false, likes: post.counts.likes });

  const updated = await Post.findByIdAndUpdate(
    post._id,
    { $inc: { 'counts.likes': -1 } },
    { new: true }
  );

  await removeNotification({
    recipientId: post.author._id,
    actorId: req.user._id,
    type: 'like',
    postId: post._id,
  });

  res.status(StatusCodes.OK).json({ status: 'success', liked: false, likes: updated.counts.likes });
};

export const repost = async (req, res) => {
  const target = await loadPost(req.params.id);
  await assertCanViewPost(req.user, target);

  const quote = String(req.body.text ?? '').trim();
  const kind = quote ? 'quote' : 'repost';

  if (kind === 'repost') {
    // A plain repost is idempotent — pressing it twice should not fill a
    // timeline with duplicates of the same post.
    const existing = await Post.findOne({
      author: req.user._id,
      repostOf: target._id,
      kind: 'repost',
      deletedAt: null,
    });
    if (existing)
      return res.status(StatusCodes.OK).json({ status: 'success', reposted: true });
  }

  const post = await Post.create({
    author: req.user._id,
    text: quote,
    kind,
    repostOf: target._id,
    hashtags: extractHashtags(quote),
    mentions: await resolveMentions(quote),
  });

  await Promise.all([
    Post.updateOne({ _id: target._id }, { $inc: { 'counts.reposts': 1 } }),
    User.updateOne({ _id: req.user._id }, { $inc: { 'counts.posts': 1 } }),
  ]);

  await notify({
    recipientId: target.author._id,
    actorId: req.user._id,
    type: kind,
    postId: target._id,
  });

  const populated = await Post.findById(post._id).populate(postPopulate).lean();
  const [hydrated] = await hydratePosts([populated], req.user._id);

  res.status(StatusCodes.CREATED).json({ status: 'success', post: hydrated, reposted: true });
};

export const undoRepost = async (req, res) => {
  const target = await loadPost(req.params.id, { withAuthor: false });
  const existing = await Post.findOneAndDelete({
    author: req.user._id,
    repostOf: target._id,
    kind: 'repost',
  });

  if (existing) {
    await Promise.all([
      Post.updateOne({ _id: target._id }, { $inc: { 'counts.reposts': -1 } }),
      User.updateOne({ _id: req.user._id }, { $inc: { 'counts.posts': -1 } }),
    ]);
  }

  res.status(StatusCodes.OK).json({ status: 'success', reposted: false });
};

export const bookmark = async (req, res) => {
  const post = await loadPost(req.params.id);
  await assertCanViewPost(req.user, post);
  await Bookmark.updateOne(
    { user: req.user._id, post: post._id },
    { $setOnInsert: { user: req.user._id, post: post._id } },
    { upsert: true }
  );
  res.status(StatusCodes.OK).json({ status: 'success', bookmarked: true });
};

export const unbookmark = async (req, res) => {
  await Bookmark.deleteOne({ user: req.user._id, post: req.params.id });
  res.status(StatusCodes.OK).json({ status: 'success', bookmarked: false });
};

export const listBookmarks = async (req, res) => {
  const limit = clampLimit(req.query.limit);
  const filter = { user: req.user._id, ...cursorFilter(decodeCursor(req.query.cursor)) };

  const { items, nextCursor } = await paginate(
    Bookmark.find(filter).populate({ path: 'post', populate: postPopulate }).lean(),
    { cursor: req.query.cursor, limit }
  );

  const posts = items.map((b) => b.post).filter((p) => p && !p.deletedAt);
  res
    .status(StatusCodes.OK)
    .json({ status: 'success', items: await hydratePosts(posts, req.user._id), nextCursor });
};

export const listLikers = async (req, res) => {
  const post = await loadPost(req.params.id);
  await assertCanViewPost(req.user, post);

  const rows = await Like.find({ post: post._id })
    .populate('user', 'handle displayName avatar bio')
    .sort({ createdAt: -1 })
    .limit(clampLimit(req.query.limit, 30))
    .lean();

  res
    .status(StatusCodes.OK)
    .json({ status: 'success', items: rows.map((r) => r.user).filter(Boolean) });
};
