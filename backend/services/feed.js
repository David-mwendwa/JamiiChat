import mongoose from 'mongoose';
import Post from '../models/postModel.js';
import Like from '../models/likeModel.js';
import Bookmark from '../models/bookmarkModel.js';
import { viewerScope } from './visibility.js';
import { cursorFilter, decodeCursor, paginate } from '../utils/cursor.js';

// Feed assembly is fan-out on read: the home timeline is a query over posts by
// the accounts you follow, resolved at request time.
//
// The alternative — fan-out on write — copies every new post into a
// precomputed timeline per follower. That trades a fast read for write
// amplification and a second store to keep consistent with the first. At this
// scale a compound index on {author, createdAt} with an $in over the following
// list is fast and has exactly one source of truth. The ceiling is the size of
// that $in: FOLLOWING_CEILING below is where this design stops being the right
// one, and it is documented rather than hidden.
export const FOLLOWING_CEILING = 5000;

// Explore ranking. Weights live here as named exports rather than inline
// numbers so tuning is one file, and so the scoring stays out of controllers.
export const RANK_WEIGHTS = {
  like: 1,
  reply: 2,
  repost: 3,
  // Hours before a post's score halves. Engagement decays or the same popular
  // post sits at the top of explore for a week.
  halfLifeHours: 12,
};

/**
 * How far back explore looks while there is anything recent to show.
 *
 * A bound on the candidate set, not a rule about eligibility — see exploreFeed,
 * which drops it entirely rather than serving an empty page.
 */
export const EXPLORE_WINDOW_DAYS = 7;

// Mongo documents carry `_id`; the user serializer already exposes `id`. Posts
// go through the same normalisation so the client never has to know which
// collection a record came from to read its identifier.
const serializeUser = (user) => {
  if (!user) return null;
  const { _id, __v, ...rest } = user;
  return { id: _id, ...rest };
};

const serializePost = (post) => {
  if (!post) return null;
  const { _id, __v, author, repostOf, ...rest } = post;
  return {
    id: _id,
    ...rest,
    author: serializeUser(author),
    repostOf: repostOf ? serializePost(repostOf) : null,
  };
};

const hydrate = async (posts, viewerId) => {
  if (posts.length === 0) return [];

  // A plain repost renders as its target (`repostOf`) with a byline — see
  // PostCard's `isPlainRepost` — and the action bar acts on that target, not
  // the wrapper. So "did I like/save/repost this" has to be answered for the
  // target's id too, not only the wrapper's, or every one of those states
  // reads as false on any post reached by way of a repost.
  const ids = posts.map((p) => p._id);
  const repostOfIds = posts.filter((p) => p.repostOf).map((p) => p.repostOf._id);
  const allIds = [...new Set([...ids, ...repostOfIds].map(String))];

  const [liked, saved, reposted] = viewerId
    ? await Promise.all([
        Like.find({ user: viewerId, post: { $in: allIds } }).select('post').lean(),
        Bookmark.find({ user: viewerId, post: { $in: allIds } }).select('post').lean(),
        Post.find({ author: viewerId, repostOf: { $in: allIds }, kind: 'repost', deletedAt: null })
          .select('repostOf')
          .lean(),
      ])
    : [[], [], []];

  const likedSet = new Set(liked.map((l) => String(l.post)));
  const savedSet = new Set(saved.map((b) => String(b.post)));
  const repostedSet = new Set(reposted.map((r) => String(r.repostOf)));

  const flagsFor = (id) => ({
    likedByViewer: likedSet.has(String(id)),
    bookmarkedByViewer: savedSet.has(String(id)),
    repostedByViewer: repostedSet.has(String(id)),
  });

  return posts.map((post) => {
    const serialized = serializePost(post);
    return {
      ...serialized,
      ...flagsFor(post._id),
      repostOf: serialized.repostOf
        ? { ...serialized.repostOf, ...flagsFor(post.repostOf._id) }
        : null,
    };
  });
};

// `options: { lean: true }` on each populate spec matters beyond the queries
// here that already call `.lean()` on themselves: exploreFeed populates
// author/repostOf onto plain objects coming out of an aggregate pipeline
// (aggregate results are never Mongoose-lean), and without this, Mongoose
// hydrates a full document for the populated path instead of a plain object —
// `serializeUser`'s object-spread then silently picks up Mongoose's internal
// `$__`/`_doc` fields instead of `handle`/`displayName`/`avatar`.
const POPULATE = [
  { path: 'author', select: 'handle displayName avatar isPrivate', options: { lean: true } },
  {
    path: 'repostOf',
    select: 'text media author createdAt counts',
    populate: { path: 'author', select: 'handle displayName avatar', options: { lean: true } },
    options: { lean: true },
  },
];

const baseFilter = { deletedAt: null };

// Replies are excluded from timelines — they belong to their thread, and a
// feed full of context-free replies reads as noise.
const topLevelOnly = { replyTo: null };

export const homeFeed = async ({ viewer, cursor, limit }) => {
  const scope = await viewerScope(viewer._id);
  const authors = [String(viewer._id), ...scope.following.slice(0, FOLLOWING_CEILING)];

  const filter = {
    ...baseFilter,
    ...topLevelOnly,
    author: { $in: authors.map((id) => new mongoose.Types.ObjectId(id)) },
    ...cursorFilter(decodeCursor(cursor)),
  };

  const { items, nextCursor } = await paginate(Post.find(filter).populate(POPULATE).lean(), {
    cursor,
    limit,
  });
  return { items: await hydrate(items, viewer._id), nextCursor };
};

// Explore ranks by engagement with recency decay, so it cannot use the shared
// keyset cursor — the sort key is computed, not stored. It pages by rank
// position over a bounded candidate window instead, which is honest about
// being a discovery surface rather than a complete timeline.
export const exploreFeed = async ({ viewer, page = 0, limit }) => {
  const scope = viewer ? await viewerScope(viewer._id) : { hiddenFromTimeline: [] };
  const hidden = scope.hiddenFromTimeline.map((id) => new mongoose.Types.ObjectId(id));

  /*
   * The candidate window is a bound on the scan, not a rule about what may
   * appear — so it gives way rather than emptying the page.
   *
   * It used to be a hard `createdAt >= since`, and the failure that exposed it
   * is worth stating plainly: the deployed site's Explore tab was blank,
   * because the seeded posts had aged past seven days and every one of them
   * was excluded. A discovery surface that shows nothing while the database
   * holds hundreds of posts reads as broken, and it fails exactly when a quiet
   * week means discovery matters most.
   *
   * The cut was also doing very little for ranking. Score halves every
   * `halfLifeHours` (12), so a seven-day-old post is already divided by 2^14 —
   * about 16,000 — and cannot outrank anything recent. The window bounds how
   * much the aggregation scans; the decay is what actually orders the result.
   *
   * So: use the window when there is anything in it, and fall back to the
   * whole collection when there is not. The existence check is a cheap
   * indexed lookup, and it is made once for every page rather than per page,
   * so paging cannot switch windows underneath the reader and repeat or skip
   * posts. The quiet case costs one extra query on a collection that is, by
   * definition, not busy.
   */
  const since = new Date(Date.now() - EXPLORE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const audience = { ...baseFilter, ...topLevelOnly, author: { $nin: hidden } };
  const hasRecent = await Post.exists({ ...audience, createdAt: { $gte: since } });
  const window = hasRecent ? { createdAt: { $gte: since } } : {};

  const rows = await Post.aggregate([
    { $match: { ...audience, ...window } },
    {
      $addFields: {
        ageHours: { $divide: [{ $subtract: ['$$NOW', '$createdAt'] }, 1000 * 60 * 60] },
        engagement: {
          $add: [
            { $multiply: ['$counts.likes', RANK_WEIGHTS.like] },
            { $multiply: ['$counts.replies', RANK_WEIGHTS.reply] },
            { $multiply: ['$counts.reposts', RANK_WEIGHTS.repost] },
          ],
        },
      },
    },
    {
      $addFields: {
        // Exponential half-life: score halves every `halfLifeHours`. The +1
        // keeps a brand-new post with no engagement above nothing at all.
        score: {
          $divide: [
            { $add: ['$engagement', 1] },
            { $pow: [2, { $divide: ['$ageHours', RANK_WEIGHTS.halfLifeHours] }] },
          ],
        },
      },
    },
    { $sort: { score: -1, _id: -1 } },
    { $skip: page * limit },
    { $limit: limit + 1 },
  ]);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  await Post.populate(items, POPULATE);

  return {
    items: await hydrate(items, viewer?._id),
    nextPage: hasMore ? page + 1 : null,
  };
};

// Three mutually exclusive tabs rather than the old "Posts" / "Posts and
// replies" pair, which quietly overlapped (the second was a superset of the
// first) and buried reposts inside "Posts" with no way to see just those.
// A repost is never a reply — `replyTo` is always null on one — so `replies`
// and `reposts` can't collide.
const TAB_FILTERS = {
  posts: { ...topLevelOnly, kind: { $ne: 'repost' } },
  replies: { replyTo: { $ne: null } },
  reposts: { ...topLevelOnly, kind: 'repost' },
};

export const authorFeed = async ({ viewer, authorId, cursor, limit, tab = 'posts' }) => {
  const filter = {
    ...baseFilter,
    author: authorId,
    ...(TAB_FILTERS[tab] ?? TAB_FILTERS.posts),
    ...cursorFilter(decodeCursor(cursor)),
  };
  const { items, nextCursor } = await paginate(Post.find(filter).populate(POPULATE).lean(), {
    cursor,
    limit,
  });
  return { items: await hydrate(items, viewer?._id), nextCursor };
};

export const hashtagFeed = async ({ viewer, tag, cursor, limit }) => {
  const scope = viewer ? await viewerScope(viewer._id) : { hiddenFromTimeline: [] };
  const filter = {
    ...baseFilter,
    ...topLevelOnly,
    hashtags: tag.toLowerCase(),
    author: { $nin: scope.hiddenFromTimeline.map((id) => new mongoose.Types.ObjectId(id)) },
    ...cursorFilter(decodeCursor(cursor)),
  };
  const { items, nextCursor } = await paginate(Post.find(filter).populate(POPULATE).lean(), {
    cursor,
    limit,
  });
  return { items: await hydrate(items, viewer?._id), nextCursor };
};

export const hydratePosts = hydrate;
export const postPopulate = POPULATE;
export { serializePost, serializeUser };
