import mongoose from 'mongoose';

// A pair of users must map to exactly one conversation no matter which of them
// opens it first. A unique index on `participants` cannot express that: an
// index on an array field is multikey, so it would enforce that each user
// appears in one conversation total rather than that each pair appears once.
// The deterministic key below is the thing that is actually unique.
export const pairKeyFor = (a, b) => [String(a), String(b)].sort().join(':');

const conversationSchema = new mongoose.Schema(
  {
    participants: {
      type: [{ type: mongoose.Schema.ObjectId, ref: 'User' }],
      validate: [(v) => v.length === 2, 'A conversation has exactly two participants'],
    },
    pairKey: { type: String, required: true, unique: true },
    lastMessage: { type: mongoose.Schema.ObjectId, ref: 'Message', default: null },
    lastMessageAt: { type: Date, default: Date.now },
    lastMessagePreview: { type: String, default: '' },
    // Keyed by user id: how many messages that participant has not opened.
    unread: { type: Map, of: Number, default: {} },
    // "Delete chat" — clears it from just this participant's own Messages
    // list, the same per-viewer idea as a message's own `hiddenFor`. The
    // conversation and every message in it are untouched, so the other
    // participant's copy is unaffected and this account can still open it
    // directly by a stale link. A new message from the other side clears the
    // sender back out of this list (see `sendMessage`) — deleting a chat is
    // "get it off my list for now," not "never show me this thread again."
    hiddenFor: {
      type: [{ type: mongoose.Schema.ObjectId, ref: 'User' }],
      select: false,
      default: undefined,
    },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1, lastMessageAt: -1 });

export default mongoose.model('Conversation', conversationSchema);
