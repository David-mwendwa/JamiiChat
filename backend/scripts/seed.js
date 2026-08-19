import { readFile } from 'fs/promises';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import User from '../models/userModel.js';
import Post from '../models/postModel.js';
import Follow from '../models/followModel.js';
import Like from '../models/likeModel.js';
import Bookmark from '../models/bookmarkModel.js';
import Notification from '../models/notificationModel.js';
import Conversation, { pairKeyFor } from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import Block from '../models/blockModel.js';
import Mute from '../models/muteModel.js';
import Report from '../models/reportModel.js';

import { people, posts as seedPosts, demoAccounts } from '../data/seedContent.js';
import { extractHashtags } from '../utils/text.js';

// Written by `npm run seed:images`. Kept as a committed manifest so the seed
// does not depend on regenerating artwork every time it runs.
const media = JSON.parse(
  await readFile(new URL('../data/mediaManifest.json', import.meta.url), 'utf8')
);

dotenv.config();

// Deterministic pseudo-randomness: reseeding produces the same network, so a
// screenshot taken today still matches the app tomorrow.
let seed = 20260818;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = (arr) => arr[Math.floor(random() * arr.length)];
const chance = (p) => random() < p;

// Posts are backdated across the last ten days so the feed is not a wall of
// identical timestamps and the explore ranking has real ages to decay.
const backdate = (index, total) => {
  const spread = 10 * 24 * 60 * 60 * 1000;
  const jitter = random() * 3 * 60 * 60 * 1000;
  return new Date(Date.now() - (index / total) * spread - jitter);
};

const run = async () => {
  const DB = process.env.DATABASE_URL || process.env.MONGO_URI;
  if (!DB) throw new Error('DATABASE_URL is not set');

  await mongoose.connect(DB);
  console.log(`Connected to ${mongoose.connection.name}`);

  await Promise.all([
    User.deleteMany({}),
    Post.deleteMany({}),
    Follow.deleteMany({}),
    Like.deleteMany({}),
    Bookmark.deleteMany({}),
    Notification.deleteMany({}),
    Conversation.deleteMany({}),
    Message.deleteMany({}),
    Block.deleteMany({}),
    Mute.deleteMany({}),
    Report.deleteMany({}),
  ]);
  console.log('Cleared existing data');

  // `User.create` is used rather than insertMany so the password hashing hook
  // actually runs — insertMany skips document middleware.
  const users = [];
  for (const person of people) {
    users.push(
      await User.create({
        ...person,
        email: `${person.handle}@jamii.app`,
        password: 'jamii12345',
        avatar: media.avatars[person.handle] ?? '',
        cover: media.covers[person.handle] ?? '',
      })
    );
  }

  const demos = [];
  for (const account of demoAccounts)
    demos.push(
      await User.create({
        ...account,
        avatar: media.avatars[account.handle] ?? '',
        cover: media.covers[account.handle] ?? '',
      })
    );

  const everyone = [...users, ...demos];
  const byHandle = new Map(everyone.map((u) => [u.handle, u]));
  console.log(`Created ${everyone.length} accounts`);

  // Follow graph. Each person follows roughly a third of the others, which is
  // dense enough that every home feed has content and sparse enough that the
  // profiles differ from one another.
  const edges = [];
  for (const a of everyone) {
    for (const b of everyone) {
      if (String(a._id) === String(b._id)) continue;
      if (chance(0.32)) edges.push({ follower: a._id, following: b._id, status: 'accepted' });
    }
  }
  // The demo account follows a fixed set, so its first sign-in always lands on
  // a populated timeline rather than one that depends on the dice.
  const demo = byHandle.get('demo');
  for (const handle of ['wanjiku', 'otieno', 'amina', 'grace_ui', 'omondi', 'tech_mama', 'sam_dev', 'njeri']) {
    const target = byHandle.get(handle);
    if (!edges.some((e) => String(e.follower) === String(demo._id) && String(e.following) === String(target._id)))
      edges.push({ follower: demo._id, following: target._id, status: 'accepted' });
  }

  await Follow.insertMany(edges);

  for (const user of everyone) {
    const followers = edges.filter((e) => String(e.following) === String(user._id)).length;
    const following = edges.filter((e) => String(e.follower) === String(user._id)).length;
    await User.updateOne({ _id: user._id }, { 'counts.followers': followers, 'counts.following': following });
  }
  console.log(`Created ${edges.length} follow edges`);

  // Posts, then their replies as real threaded children.
  const created = [];
  const usedArt = new Set();
  let index = 0;
  for (const entry of seedPosts) {
    const author = byHandle.get(entry.handle);
    if (!author) continue;

    const createdAt = backdate(index, seedPosts.length);
    index += 1;

    // Only a handful of posts carry artwork, and only the first one by each of
    // those authors — a feed where every post has an image reads as a gallery
    // rather than a conversation.
    const art = usedArt.has(entry.handle) ? null : media.posts[entry.handle];
    if (art) usedArt.add(entry.handle);

    const post = await Post.create({
      author: author._id,
      text: entry.text,
      media: art ? [{ url: art, width: 1200, height: 750, alt: '' }] : [],
      hashtags: extractHashtags(entry.text),
      createdAt,
      updatedAt: createdAt,
    });
    created.push(post);

    let replyCount = 0;
    for (const reply of entry.replies ?? []) {
      const replyAuthor = byHandle.get(reply.handle);
      if (!replyAuthor) continue;
      const replyAt = new Date(createdAt.getTime() + (replyCount + 1) * 40 * 60 * 1000);
      const child = await Post.create({
        author: replyAuthor._id,
        text: reply.text,
        replyTo: post._id,
        rootPost: post._id,
        depth: 1,
        hashtags: extractHashtags(reply.text),
        createdAt: replyAt,
        updatedAt: replyAt,
      });
      created.push(child);
      replyCount += 1;
    }
    if (replyCount) await Post.updateOne({ _id: post._id }, { 'counts.replies': replyCount });
  }
  console.log(`Created ${created.length} posts`);

  // Likes, written as real rows so the counters are derived from source rather
  // than typed in — the same relationship `npm run reconcile:counts` checks.
  const likes = [];
  for (const post of created) {
    for (const user of everyone) {
      if (String(user._id) === String(post.author)) continue;
      if (chance(0.18)) likes.push({ user: user._id, post: post._id });
    }
  }
  await Like.insertMany(likes, { ordered: false }).catch(() => {});

  for (const post of created) {
    const count = likes.filter((l) => String(l.post) === String(post._id)).length;
    if (count) await Post.updateOne({ _id: post._id }, { 'counts.likes': count });
  }
  console.log(`Created ${likes.length} likes`);

  for (const user of everyone) {
    const count = created.filter((p) => String(p.author) === String(user._id)).length;
    await User.updateOne({ _id: user._id }, { 'counts.posts': count });
  }

  // The demo account needs posts of its own, or every screen that shows "your"
  // content — notifications especially — opens empty and reads as broken.
  const demoPosts = [
    'Just joined Jamii. Rebuilding my portfolio site this month and posting the ugly parts too.',
    'Spent an hour today reading other people\'s code instead of writing my own. Easily the most useful hour of the week. #buildinpublic',
  ];

  const demoCreated = [];
  for (const [i, text] of demoPosts.entries()) {
    const at = new Date(Date.now() - (i + 1) * 5 * 60 * 60 * 1000);
    demoCreated.push(
      await Post.create({
        author: demo._id,
        text,
        hashtags: extractHashtags(text),
        createdAt: at,
        updatedAt: at,
      })
    );
  }
  await User.updateOne({ _id: demo._id }, { $inc: { 'counts.posts': demoPosts.length } });

  // Notifications are written the way the app writes them: one document per
  // groupKey holding every actor, so "Amina and 3 others liked your post"
  // renders from a single row rather than four.
  const likers = ['wanjiku', 'amina', 'grace_ui', 'otieno'].map((h) => byHandle.get(h)._id);
  await Like.insertMany(
    likers.map((user) => ({ user, post: demoCreated[0]._id })),
    { ordered: false }
  ).catch(() => {});
  await Post.updateOne({ _id: demoCreated[0]._id }, { 'counts.likes': likers.length });

  const replier = byHandle.get('tech_mama');
  const replyAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const demoReply = await Post.create({
    author: replier._id,
    text: 'The ugly parts are the useful ones. Keep posting them.',
    replyTo: demoCreated[0]._id,
    rootPost: demoCreated[0]._id,
    depth: 1,
    createdAt: replyAt,
    updatedAt: replyAt,
  });
  await Post.updateOne({ _id: demoCreated[0]._id }, { 'counts.replies': 1 });
  // The reply is a Post like any other, so its author's post count moves too.
  // Missing this is what `npm run reconcile:counts` caught first.
  await User.updateOne({ _id: replier._id }, { $inc: { 'counts.posts': 1 } });

  const newFollowers = ['kevo', 'sarah_dev', 'dennis'].map((h) => byHandle.get(h)._id);

  await Notification.insertMany([
    {
      recipient: demo._id,
      actors: likers,
      type: 'like',
      post: demoCreated[0]._id,
      groupKey: `like:${demoCreated[0]._id}`,
      read: false,
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    },
    {
      recipient: demo._id,
      actors: [replier._id],
      type: 'reply',
      post: demoReply._id,
      groupKey: `reply:${demoReply._id}`,
      read: false,
      createdAt: replyAt,
      updatedAt: replyAt,
    },
    ...newFollowers.map((actor, i) => ({
      recipient: demo._id,
      actors: [actor],
      type: 'follow',
      groupKey: `follow:${actor}`,
      read: i > 0,
      createdAt: new Date(Date.now() - (i + 3) * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - (i + 3) * 60 * 60 * 1000),
    })),
  ]);

  console.log('Created demo posts and 5 notifications');

  // A couple of conversations so the messages screen is not empty on first
  // open — a DM view with nothing in it cannot demonstrate that it is live.
  const conversationSeeds = [
    {
      pair: ['demo', 'wanjiku'],
      messages: [
        ['wanjiku', 'Hey! Saw you joined. Welcome to Jamii 👋'],
        ['demo', 'Thanks! Still finding my way around.'],
        ['wanjiku', 'Start with Explore — the feed fills up once you follow a few people.'],
      ],
    },
    {
      pair: ['demo', 'omondi'],
      messages: [
        ['omondi', 'Did you see the M-Pesa thread? Curious what you think.'],
        ['demo', 'Reading it now. The callback race is one I have hit before.'],
      ],
    },
  ];

  for (const entry of conversationSeeds) {
    const [a, b] = entry.pair.map((h) => byHandle.get(h));
    const participants = [a._id, b._id].sort((x, y) => String(x).localeCompare(String(y)));

    const convo = await Conversation.create({
      participants,
      pairKey: pairKeyFor(a._id, b._id),
    });

    let last = null;
    let at = new Date(Date.now() - 3 * 60 * 60 * 1000);
    for (const [handle, text] of entry.messages) {
      at = new Date(at.getTime() + 6 * 60 * 1000);
      last = await Message.create({
        conversation: convo._id,
        sender: byHandle.get(handle)._id,
        text,
        createdAt: at,
        updatedAt: at,
      });
    }

    convo.lastMessage = last._id;
    convo.lastMessageAt = last.createdAt;
    convo.lastMessagePreview = last.text.slice(0, 80);
    // The demo account opens on an unread badge, so the feature is visible
    // without having to arrange for someone to message you.
    convo.unread.set(String(byHandle.get('demo')._id), 1);
    await convo.save();
  }
  console.log(`Created ${conversationSeeds.length} conversations`);

  console.log('\nSeed complete.');
  console.log('  demo@jamii.app  / demo12345');
  console.log('  admin@jamii.app / admin12345');
  console.log('  every seeded account: <handle>@jamii.app / jamii12345');

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('Seed failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
