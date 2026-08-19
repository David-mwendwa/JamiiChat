import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = [
  'like',
  'reply',
  'repost',
  'quote',
  'follow',
  'follow_back',
  'follow_request',
  'mention',
];

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
    // Everyone who triggered this notification, most recent first. Fifty likes
    // on one post produce one document with fifty actors, not fifty rows.
    actors: [{ type: mongoose.Schema.ObjectId, ref: 'User' }],
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    post: { type: mongoose.Schema.ObjectId, ref: 'Post', default: null },
    // Identifies the thing being notified about, so repeat events upsert onto
    // the same document instead of creating a new one.
    groupKey: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, groupKey: 1 }, { unique: true });
notificationSchema.index({ recipient: 1, read: 1 });

export default mongoose.model('Notification', notificationSchema);
