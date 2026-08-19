// socket.io-client lives in the frontend's dependencies — this test drives the
// API the way a browser does, so it uses the same client the app ships with.
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { io } = require('../../frontend/node_modules/socket.io-client');

// Cleanup talks to Mongo directly rather than through the API. The alternative
// — a test-only HTTP route — would have to ship in production purely to serve
// this suite, which is a worse trade than a database handle in a test file.
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

// Every message id this run creates, so cleanup can remove exactly those.
const createdMessageIds = [];

const cleanup = async (conversationId, testPostId) => {
  const uri = process.env.DATABASE_URL || process.env.MONGO_URI;
  if (!uri) return;
  if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
  const db = mongoose.connection.db;

  // The posts this suite created, by their exact text. Removing them directly
  // skips the controller that would have decremented the author's post count
  // and left no orphan likes, so both are handled explicitly below.
  const removed = await db
    .collection('posts')
    .find({ text: { $in: ['A post to be liked, for testing notifications.'] } })
    .project({ _id: 1 })
    .toArray();
  const removedIds = removed.map((r) => r._id);

  await db.collection('posts').deleteMany({ _id: { $in: removedIds } });
  await db.collection('likes').deleteMany({ post: { $in: removedIds } });
  // Deleted strictly by the ids this run created. Matching on `deletedAt` or
  // on empty text would sweep up tombstones left by real people using the app,
  // which is exactly the data a cleanup routine must not touch.
  if (createdMessageIds.length)
    await db
      .collection('messages')
      .deleteMany({ _id: { $in: createdMessageIds.map((x) => new mongoose.Types.ObjectId(String(x))) } });
  // Scoped to this run's post. Deleting every like notification would take the
  // seeded ones with it and leave the notifications screen emptier each time
  // the suite ran.
  if (testPostId)
    await db
      .collection('notifications')
      .deleteMany({ post: new mongoose.Types.ObjectId(String(testPostId)) });

  // Rebuild post counts from source for anyone whose posts were removed, so a
  // run leaves the database exactly as it found it. This is the same
  // relationship `npm run reconcile:counts` asserts.
  const totals = await db
    .collection('posts')
    .aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$author', n: { $sum: 1 } } }])
    .toArray();

  await db.collection('users').bulkWrite(
    totals.map((t) => ({
      updateOne: { filter: { _id: t._id }, update: { $set: { 'counts.posts': t.n } } },
    }))
  );

  // Restore the conversation preview to whatever its newest surviving message
  // is, so the messages list does not advertise a deleted test message.
  const newest = await db
    .collection('messages')
    .find({ conversation: new mongoose.Types.ObjectId(String(conversationId)) })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();

  if (newest[0]) {
    await db.collection('conversations').updateOne(
      { _id: new mongoose.Types.ObjectId(String(conversationId)) },
      {
        $set: {
          lastMessage: newest[0]._id,
          lastMessageAt: newest[0].createdAt,
          lastMessagePreview: newest[0].text.slice(0, 80),
        },
      }
    );
  }

  await mongoose.disconnect();
};

const API = 'http://localhost:5007';

const login = async (identifier, password) => {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const json = await res.json();
  if (!json.token) throw new Error(`login failed for ${identifier}: ${json.message}`);
  return json;
};

const connect = (token, label) =>
  new Promise((resolve, reject) => {
    const socket = io(API, { auth: { token }, transports: ['websocket'] });
    socket.on('ready', ({ userId }) => {
      console.log(`  [${label}] socket ready, userId=${userId.slice(-6)}`);
      resolve(socket);
    });
    socket.on('connect_error', (err) => reject(new Error(`${label}: ${err.message}`)));
    setTimeout(() => reject(new Error(`${label}: timed out`)), 8000);
  });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

// Run against a seeded database with the API already listening:
//   npm run seed && npm run dev, then `npm run test:realtime`
const run = async () => {
  console.log('\n1. Handshake auth');
  const demo = await login('demo', 'demo12345');
  const wanjiku = await login('wanjiku', 'jamii12345');

  // A socket with no credential must be refused at the handshake.
  await new Promise((resolve) => {
    const bad = io(API, { auth: { token: 'not-a-real-token' }, transports: ['websocket'] });
    bad.on('connect_error', (err) => {
      check('rejects an invalid token', err.message === 'unauthorized', err.message);
      bad.close();
      resolve();
    });
    bad.on('ready', () => {
      check('rejects an invalid token', false, 'it connected anyway');
      bad.close();
      resolve();
    });
  });

  const demoSocket = await connect(demo.token, 'demo');
  const wanjikuSocket = await connect(wanjiku.token, 'wanjiku');
  check('accepts a valid token', true);

  console.log('\n2. Direct messages');
  const convoRes = await fetch(`${API}/api/v1/conversations/with/wanjiku`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${demo.token}` },
  });
  const { conversation } = await convoRes.json();
  console.log(`  conversation ${conversation.id}`);

  const joined = await Promise.all([
    new Promise((r) => demoSocket.emit('conversation:join', conversation.id, r)),
    new Promise((r) => wanjikuSocket.emit('conversation:join', conversation.id, r)),
  ]);
  check('both participants join the room', joined.every((j) => j.ok), JSON.stringify(joined));

  // The core claim: a message sent over HTTP by one user arrives on the other
  // user's open socket without them asking for it.
  const delivered = new Promise((resolve) => {
    wanjikuSocket.once('message:new', ({ message }) => resolve(message));
    setTimeout(() => resolve(null), 5000);
  });

  await fetch(`${API}/api/v1/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${demo.token}` },
    body: JSON.stringify({ text: 'Testing the live socket path.' }),
  });

  const message = await delivered;
  if (message?._id) createdMessageIds.push(message._id);
  check('message reaches the other user live', message?.text === 'Testing the live socket path.', message ? `"${message.text}"` : 'nothing arrived');

  // Delivery is decided at write time from the recipient's live socket, so a
  // message sent while they are connected must already carry `deliveredAt` —
  // and must not yet be read, since wanjiku has not opened the thread.
  check(
    'sent to a connected recipient is marked delivered, not read',
    Boolean(message?.deliveredAt) && !message?.readAt,
    `deliveredAt=${message?.deliveredAt ?? 'null'} readAt=${message?.readAt ?? 'null'}`
  );

  console.log('\n3. Edit and delete');
  const editedLive = new Promise((resolve) => {
    wanjikuSocket.once('message:edited', (p) => resolve(p));
    setTimeout(() => resolve(null), 5000);
  });
  const editRes = await fetch(
    `${API}/api/v1/conversations/${conversation.id}/messages/${message._id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${demo.token}` },
      body: JSON.stringify({ text: 'Testing the live socket path. (edited)' }),
    }
  );
  const editBody = await editRes.json();
  check(
    'author can edit inside the window, and it is labelled',
    editRes.status === 200 && Boolean(editBody.message?.editedAt),
    `status=${editRes.status}`
  );
  const editedPayload = await editedLive;
  check(
    'edit reaches the other user live',
    editedPayload?.message?.text === 'Testing the live socket path. (edited)',
    editedPayload ? `"${editedPayload.message.text}"` : 'nothing arrived'
  );

  // The window is enforced server-side, so a forged old message cannot be
  // edited even though the client would happily ask.
  const stale = await fetch(`${API}/api/v1/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${demo.token}` },
    body: JSON.stringify({ text: 'This must not leak.' }),
  }).then((r) => r.json());
  if (stale.message?._id) createdMessageIds.push(stale.message._id);
  // cleanup() opens its own connection later; reuse this one if it is already up.
  if (mongoose.connection.readyState === 0)
    await mongoose.connect(process.env.DATABASE_URL || process.env.MONGO_URI);
  await mongoose.connection.db
    .collection('messages')
    .updateOne(
      { _id: new mongoose.Types.ObjectId(String(stale.message._id)) },
      { $set: { createdAt: new Date(Date.now() - 60 * 60 * 1000) } }
    );
  const tooLate = await fetch(
    `${API}/api/v1/conversations/${conversation.id}/messages/${stale.message._id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${demo.token}` },
      body: JSON.stringify({ text: 'rewriting history' }),
    }
  );
  check('editing past the window is refused', tooLate.status === 400, `status=${tooLate.status}`);

  // Someone else's message is not theirs to edit, regardless of the window.
  const notMine = await fetch(
    `${API}/api/v1/conversations/${conversation.id}/messages/${message._id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wanjiku.token}` },
      body: JSON.stringify({ text: 'not my message' }),
    }
  );
  // 403, not 401: the caller is authenticated, they just do not own it.
  check('editing someone else\'s message is refused', notMine.status === 403, `status=${notMine.status}`);

  const deletedLive = new Promise((resolve) => {
    wanjikuSocket.once('message:deleted', (p) => resolve(p));
    setTimeout(() => resolve(null), 5000);
  });
  const delRes = await fetch(
    `${API}/api/v1/conversations/${conversation.id}/messages/${message._id}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${demo.token}` } }
  );
  const delBody = await delRes.json();
  check(
    'delete tombstones the message rather than dropping its text into the response',
    delRes.status === 200 && delBody.message?.text === '' && Boolean(delBody.message?.deletedAt),
    `text="${delBody.message?.text}"`
  );
  const deletedPayload = await deletedLive;
  check('delete reaches the other user live', Boolean(deletedPayload?.message?.deletedAt));

  console.log('\n4. Typing indicator');
  const typing = new Promise((resolve) => {
    wanjikuSocket.once('typing:start', (p) => resolve(p));
    setTimeout(() => resolve(null), 4000);
  });
  demoSocket.emit('typing:start', { conversationId: conversation.id });
  const typingPayload = await typing;
  check('typing indicator relays', Boolean(typingPayload), typingPayload ? 'received' : 'nothing arrived');

  // Regression: `.except()` returns a new broadcast operator rather than
  // mutating the original, so calling it for its side effect silently dropped
  // the exclusion and the sender received their own typing event back — which
  // rendered as the other person typing.
  const selfEcho = new Promise((resolve) => {
    demoSocket.once('typing:start', () => resolve(true));
    setTimeout(() => resolve(false), 2500);
  });
  demoSocket.emit('typing:start', { conversationId: conversation.id });
  check('typing does not echo back to the sender', (await selfEcho) === false);

  console.log('\n5. Live notifications');
  // wanjiku likes a demo post; demo should hear about it without polling.
  const postRes = await fetch(`${API}/api/v1/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${demo.token}` },
    body: JSON.stringify({ text: 'A post to be liked, for testing notifications.' }),
  });
  const { post } = await postRes.json();

  const notified = new Promise((resolve) => {
    demoSocket.once('notification:new', (p) => resolve(p));
    setTimeout(() => resolve(null), 5000);
  });

  await fetch(`${API}/api/v1/posts/${post.id}/like`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${wanjiku.token}` },
  });

  const note = await notified;
  check(
    'like notification arrives live',
    note?.notification?.type === 'like',
    note ? `type=${note.notification.type}, unread=${note.unreadCount}` : 'nothing arrived'
  );

  console.log('\n6. Room isolation');
  // A third party must not receive a conversation they are not part of.
  const otieno = await login('otieno', 'jamii12345');
  const otienoSocket = await connect(otieno.token, 'otieno');

  const intruderJoin = await new Promise((r) =>
    otienoSocket.emit('conversation:join', conversation.id, r)
  );
  check('non-participant is refused the room', intruderJoin.ok === false, JSON.stringify(intruderJoin));

  const leaked = new Promise((resolve) => {
    otienoSocket.once('message:new', () => resolve(true));
    setTimeout(() => resolve(false), 3000);
  });
  await fetch(`${API}/api/v1/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${demo.token}` },
    body: JSON.stringify({ text: 'This must not leak.' }),
  });
  check('message does not leak to a non-participant', (await leaked) === false);

  for (const s of [demoSocket, wanjikuSocket, otienoSocket]) s.close();

  // Clean up after itself. This suite posts, likes and sends real messages
  // against the seeded database; left behind, its artifacts turn up in the
  // feed and the conversation list the next time anyone opens the app.
  await cleanup(conversation.id, post.id);
  console.log('\nCleaned up test artifacts.');

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
};

run().catch((err) => {
  console.error('\nTest run failed:', err.message);
  process.exit(1);
});
