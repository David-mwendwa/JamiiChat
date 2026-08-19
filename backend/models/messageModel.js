import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.ObjectId, ref: 'Conversation', required: true },
    sender: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
    text: { type: String, trim: true, maxlength: [2000, 'That message is too long'], default: '' },
    media: { type: String, default: '' },
    // Set only for a voice message. The client measures it while recording
    // and the bubble shows it immediately, rather than waiting on the
    // `<audio>` element's own `loadedmetadata` — which some browsers report
    // as `Infinity` for a streamed/appended blob until playback has actually
    // started once.
    mediaDuration: { type: Number, default: undefined },
    // Three receipt states, not two. `deliveredAt` separates "it reached them
    // and they have not opened it" from "it never got there" — with only
    // readAt, both render identically and the tick tells you nothing useful.
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
    // An edit changes what was said, so the label is permanent: this app has
    // read receipts, which means an edit can land on a message the other
    // person has already read, and they need to be able to tell.
    editedAt: { type: Date, default: null },
    // Soft delete. The row survives so the thread keeps its shape and the
    // recipient sees that something was removed rather than a message
    // silently vanishing from the middle of a conversation.
    deletedAt: { type: Date, default: null },
    // "Delete for me" — WhatsApp's other delete, distinct from `deletedAt`.
    // That one is a shared tombstone both participants see; this is a
    // per-viewer hide that never touches the shared record, so it works on
    // any message including one already tombstoned (clearing the "This
    // message was deleted" row out of just your own thread) without being
    // able to affect what the other participant sees. `select: false`
    // because it is bookkeeping for the query filter, not something either
    // client ever needs handed back to them.
    hiddenFor: { type: [{ type: mongoose.Schema.ObjectId, ref: 'User' }], select: false, default: undefined },
    // What the message said before an edit or delete overwrote it.
    // `select: false` keeps it out of every normal query — including the
    // populated response an edit/delete request itself returns — so the
    // existing guarantee ("a deleted message's content is not served to
    // anyone reading the API response") still holds. It exists for
    // moderation and audit purposes, fetched explicitly with
    // `.select('+versions')` when that's actually needed, not for display.
    versions: {
      type: [
        {
          text: String,
          media: String,
          reason: { type: String, enum: ['edit', 'delete'], required: true },
          changedAt: { type: Date, default: Date.now },
          _id: false,
        },
      ],
      select: false,
      default: undefined,
    },
  },
  { timestamps: true }
);

// How long after sending a message may it still be edited. Deleting has no
// equivalent limit: the tombstone already tells the recipient the message was
// removed, so nothing is being rewritten behind their back. An edit does
// change the text, so it is time-boxed.
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export const canStillEdit = (message, now = Date.now()) =>
  now - new Date(message.createdAt).getTime() <= EDIT_WINDOW_MS;

messageSchema.index({ conversation: 1, createdAt: -1 });

messageSchema.pre('validate', function (next) {
  // A deleted message is deliberately empty — it keeps its row so the thread
  // keeps its shape, and the "needs text or an image" rule only governs what
  // someone is allowed to send, not what survives a delete.
  if (this.deletedAt) return next();
  if (!this.text?.trim() && !this.media) this.invalidate('text', 'Write a message first');
  next();
});

export default mongoose.model('Message', messageSchema);
