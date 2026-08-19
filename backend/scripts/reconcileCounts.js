import dotenv from 'dotenv';
import mongoose from 'mongoose';

import User from '../models/userModel.js';
import Post from '../models/postModel.js';
import Like from '../models/likeModel.js';
import Follow from '../models/followModel.js';

dotenv.config();

// Rebuilds every denormalised counter from its source collection.
//
// The counters exist so a profile header is one document read rather than three
// count queries, and so a feed does not need a lookup per post. They are
// derived values held in two places, which is exactly the shape that drifts:
// a crash between the insert and the $inc, a document deleted directly in the
// database, a bug in a path that forgets to decrement.
//
// This script is what makes "derived" true rather than aspirational. Run it on
// a schedule, or after anything that touched the data outside the app.
//
//   npm run reconcile:counts            report drift, change nothing
//   npm run reconcile:counts -- --fix   write the corrected values

const shouldFix = process.argv.includes('--fix');

const run = async () => {
  const uri = process.env.DATABASE_URL || process.env.MONGO_URI;
  if (!uri) throw new Error('DATABASE_URL is not set');

  await mongoose.connect(uri);
  console.log(`Connected to ${mongoose.connection.name}`);
  console.log(shouldFix ? 'Mode: FIX (values will be written)\n' : 'Mode: report only (pass --fix to write)\n');

  const drift = [];

  // --- Post counters: likes, replies, reposts ---
  const [likeTotals, replyTotals, repostTotals] = await Promise.all([
    Like.aggregate([{ $group: { _id: '$post', n: { $sum: 1 } } }]),
    Post.aggregate([
      { $match: { replyTo: { $ne: null }, deletedAt: null } },
      { $group: { _id: '$replyTo', n: { $sum: 1 } } },
    ]),
    Post.aggregate([
      { $match: { repostOf: { $ne: null }, deletedAt: null } },
      { $group: { _id: '$repostOf', n: { $sum: 1 } } },
    ]),
  ]);

  const asMap = (rows) => new Map(rows.map((r) => [String(r._id), r.n]));
  const likes = asMap(likeTotals);
  const replies = asMap(replyTotals);
  const reposts = asMap(repostTotals);

  const posts = await Post.find({}).select('counts').lean();
  const postWrites = [];

  for (const post of posts) {
    const id = String(post._id);
    const truth = {
      likes: likes.get(id) ?? 0,
      replies: replies.get(id) ?? 0,
      reposts: reposts.get(id) ?? 0,
    };

    for (const key of ['likes', 'replies', 'reposts']) {
      if ((post.counts?.[key] ?? 0) !== truth[key])
        drift.push(`post ${id} ${key}: ${post.counts?.[key] ?? 0} → ${truth[key]}`);
    }

    if (
      (post.counts?.likes ?? 0) !== truth.likes ||
      (post.counts?.replies ?? 0) !== truth.replies ||
      (post.counts?.reposts ?? 0) !== truth.reposts
    ) {
      postWrites.push({
        updateOne: { filter: { _id: post._id }, update: { $set: { counts: truth } } },
      });
    }
  }

  // --- User counters: followers, following, posts ---
  const [followerTotals, followingTotals, postTotals] = await Promise.all([
    Follow.aggregate([
      { $match: { status: 'accepted' } },
      { $group: { _id: '$following', n: { $sum: 1 } } },
    ]),
    Follow.aggregate([
      { $match: { status: 'accepted' } },
      { $group: { _id: '$follower', n: { $sum: 1 } } },
    ]),
    // Soft-deleted posts do not count, matching what the profile lists.
    Post.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$author', n: { $sum: 1 } } },
    ]),
  ]);

  const followers = asMap(followerTotals);
  const following = asMap(followingTotals);
  const authored = asMap(postTotals);

  const users = await User.find({}).select('handle counts').lean();
  const userWrites = [];

  for (const user of users) {
    const id = String(user._id);
    const truth = {
      followers: followers.get(id) ?? 0,
      following: following.get(id) ?? 0,
      posts: authored.get(id) ?? 0,
    };

    for (const key of ['followers', 'following', 'posts']) {
      if ((user.counts?.[key] ?? 0) !== truth[key])
        drift.push(`@${user.handle} ${key}: ${user.counts?.[key] ?? 0} → ${truth[key]}`);
    }

    if (
      (user.counts?.followers ?? 0) !== truth.followers ||
      (user.counts?.following ?? 0) !== truth.following ||
      (user.counts?.posts ?? 0) !== truth.posts
    ) {
      userWrites.push({
        updateOne: { filter: { _id: user._id }, update: { $set: { counts: truth } } },
      });
    }
  }

  if (drift.length === 0) {
    console.log(`No drift. Checked ${posts.length} posts and ${users.length} accounts.`);
  } else {
    console.log(`${drift.length} counter(s) out of step:`);
    for (const line of drift.slice(0, 40)) console.log('  ' + line);
    if (drift.length > 40) console.log(`  … and ${drift.length - 40} more`);

    if (shouldFix) {
      if (postWrites.length) await Post.bulkWrite(postWrites);
      if (userWrites.length) await User.bulkWrite(userWrites);
      console.log(`\nCorrected ${postWrites.length} post(s) and ${userWrites.length} account(s).`);
    } else {
      console.log('\nNothing written. Re-run with --fix to correct them.');
    }
  }

  await mongoose.disconnect();
  // Non-zero on drift in report mode, so this can gate a scheduled job.
  process.exit(drift.length && !shouldFix ? 1 : 0);
};

run().catch(async (err) => {
  console.error('Reconcile failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
