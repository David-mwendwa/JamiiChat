# JamiiChat

A social platform — posts, a follow graph, threaded replies, and conversations
that update while you are looking at them. Built with the MERN stack plus
Socket.IO.

"Jamii" is Swahili for *community*.

## Running it

```bash
# Mongo comes from the workspace Docker compose
docker compose -f ../infra/docker-compose.yml up -d mongo

npm run install:all
npm run seed          # ~22 accounts, 40 posts with real reply threads, 2 conversations
npm run dev           # API on :5007, web on :5012
```

Demo sign-ins (the sign-in page has fill buttons for the first two):

| Account | Email | Password |
|---|---|---|
| Demo user | `demo@jamii.app` | `demo12345` |
| Admin | `admin@jamii.app` | `admin12345` |
| Any seeded person | `<handle>@jamii.app` | `jamii12345` |

## What is built

Auth and sessions with email-based password reset, profiles with handles and
avatars, a follow graph with private accounts and follow requests, posts with
images, reposts and quotes, threaded replies, likes, bookmarks, home and
explore feeds, hashtags, mentions, search, live notifications, live direct
messages with text, images and recorded voice notes, one-to-one voice and
video calls over WebRTC, message editing (time-boxed) and two distinct kinds
of delete, block and mute, reporting with an admin moderation queue, and dark
mode.

## Password reset

`POST /auth/password/forgot` and `PATCH /auth/password/reset/:token` follow
the same pattern as BazaarKE's: the response is identical whether or not the
email has an account, so the form can't be used to test which addresses are
registered; the emailed link points at the frontend route
(`/password/reset/:token`), not the API; and only the SHA-256 hash of the
reset token is stored, so a database dump alone can't produce a working link.
The link expires after 30 minutes.

Email goes through `utils/mailer.js` — a deliverable address is sent for real
via `SMTP_*`, and anything else (the `@jamii.app` seed accounts, reserved test
domains) is routed to a Mailtrap sandbox inbox instead, so testing the flow
against a seeded account never risks a bounce against a real mail server.
Outside production, if no mail server is configured at all, the reset link is
returned directly in the API response instead of silently vanishing.

## Deleting a message, and deleting a chat

A message has two separate delete paths, not one, because "I sent that by
mistake" and "I don't want to see this anymore" are different requests:

- **Delete** (own messages, inside the 15-minute edit window) tombstones the
  message for both sides — the other person sees "This message was deleted."
  Multi-select applies this per message, not to the whole batch: a message
  outside the window, or one the other person sent, silently falls back to
  the option below instead.
- **Delete for me** (any message, any age, either side's) hides it from only
  this account's own view. It is a `hiddenFor` array on the message, checked
  with `$ne` in the list query — nothing is ever served back to a client that
  hid it, but the other participant's copy is untouched.

A whole conversation can be deleted the same "for me" way from the Messages
list — swipe left to reveal it, or use the always-present delete affordance.
It clears from your list and reappears on its own the next time the other
person messages you, the same way WhatsApp brings a cleared chat back rather
than blocking it forever.

## Calls

Voice and video are peer-to-peer WebRTC, signaled over the same Socket.IO
connection messages already use — `socket/handlers/calls.js` relays
invite/accept/decline/offer/answer/ICE-candidate between exactly two people,
with membership checked against the conversation the same way message
delivery is. `CallProvider` on the frontend owns the `RTCPeerConnection` and
the state machine (ringing → active → ended); `CallOverlay` renders on top of
whatever page is open, since a ring should not depend on which screen someone
happens to be looking at.

ICE uses Google's public STUN plus Open Relay Project's published free TURN
credentials — enough to connect through an ordinary home NAT, but it is a
shared, rate-limited public relay, not a dedicated one. Swap in a real TURN
service before this carries production call volume.

## The real-time layer

Express and Socket.IO share one HTTP server, so both are reachable on the same
port under the same CORS allowlist.

The socket handshake reuses the exact JWT verification the HTTP middleware uses
(`utils/token.js` → `middleware/auth.js` → `socket/index.js`). A second auth
mechanism would be a second thing to get wrong, and would let a suspended
account keep a live socket after its API access was cut off.

On connect a socket joins `user:<id>`, derived from the verified handshake and
never from anything the client sends afterwards. Conversation rooms are joined
only after membership is checked server-side — a client asking to join a room
is a request, not a fact.

`npm run test:realtime` drives the running API with two real socket clients and
checks 16 things end to end: token handshake rejection and acceptance, both
participants joining a conversation, a message sent over HTTP arriving on the
other user's socket, editing and deleting inside and outside the time window,
typing indicators, a live notification, and that a non-participant is refused
the room and never sees a message leak.

## Decisions worth knowing about

**Fan-out on read.** The home timeline is a query over posts by the accounts you
follow, resolved at request time, rather than a precomputed per-follower
timeline. One source of truth instead of write amplification plus a second store
to keep consistent. The ceiling is the size of the `$in` — `FOLLOWING_CEILING`
in `services/feed.js` — and it is documented rather than hidden.

**Cursor pagination everywhere.** A feed gains rows while you scroll, so an
offset re-runs against a list that has shifted underneath it and serves rows
twice or skips them. Every list pages by `(createdAt, _id)` keyset instead —
`utils/cursor.js`, used by feeds, replies, notifications, messages and search.
Explore is the one exception, and it says so: its sort key is a computed score,
not a stored field, so it pages by rank position.

**Counters cannot drift.** A like is a row in `Like` with a unique index on
`{post, user}`, never an element pushed into an array on the post. Insert first,
catch the duplicate key as a no-op, then `$inc`. That makes a double-tap a
database error rather than a race. `npm run reconcile:counts` rebuilds counters
from source.

**One visibility gate.** Blocking, muting and private accounts have to be
enforced on the feed, profiles, search, notifications, mentions, DMs and single
posts. Enforced ad hoc at each call site, one gets forgotten — and a forgotten
one is a privacy failure, not a display glitch. Every read path composes
`services/visibility.js`. Blocking is symmetric, which is the half that is easy
to get half-right.

**Notifications aggregate at write time.** Fifty likes on one post produce one
document with fifty actors, keyed by `groupKey`, not fifty rows to page through.

**Replies are a capped tree.** Depth is capped at 2; deeper replies attach to
their level-2 ancestor and render flat. A post carries `rootPost`, so a whole
thread loads with one indexed query instead of a recursive walk. Replies are
Posts, so a reply can be liked, reposted and quoted for free.

**Uploads are re-encoded.** The stored extension comes from what sharp reports
after decoding, never from the client filename. Re-encoding also strips EXIF,
which removes the GPS coordinates phones attach to photos. Media is served with
`Cross-Origin-Resource-Policy: cross-origin` scoped to that route only, because
Helmet's `same-origin` default would otherwise block the frontend on its own
port from loading any of it.

## Layout

```
backend/    app.js + server.js, socket/, routes/, controllers/, services/,
            models/, middleware/, errors/, utils/, scripts/, tests/
frontend/   api/, socket/, context/, hooks/, components/, pages/, lib/
```

Ports: API `5007`, web `5012` (pinned — the CORS allowlist matches a fixed
origin). Mongo database `jamii`.

## Not built

Group calls, video transcoding, live streaming, a dedicated TURN server,
end-to-end encrypted DMs, ML feed ranking, ads, native apps. Each is either a
multi-week subsystem or needs infrastructure a free hosting tier cannot host;
cutting them is what made the rest finishable.
