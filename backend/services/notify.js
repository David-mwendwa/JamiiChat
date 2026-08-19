import Notification from '../models/notificationModel.js';
import { emitToUser } from '../socket/emit.js';
import { isBlockedBetween } from './visibility.js';

// Notifications are aggregated at write time, not at read time.
//
// Fifty likes on one post must not produce fifty rows to page through and
// count. Each event carries a groupKey identifying the thing being notified
// about; an upsert either creates the document or pushes the new actor onto
// the existing one and bumps its timestamp. "Amina and 12 others liked your
// post" then renders from a single document.
const groupKeyFor = ({ type, postId, actorId }) => {
  switch (type) {
    case 'like':
    case 'reply':
    case 'repost':
    case 'quote':
      return `${type}:${postId}`;
    // A follow has no post to group by, so each follower is their own row —
    // otherwise unfollowing and refollowing would silently resurface an old
    // notification.
    case 'follow':
    case 'follow_back':
    case 'follow_request':
      return `${type}:${actorId}`;
    case 'mention':
      return `mention:${postId}:${actorId}`;
    default:
      return `${type}:${postId ?? actorId}`;
  }
};

export const notify = async ({ recipientId, actorId, type, postId = null }) => {
  if (!recipientId || !actorId) return null;
  // Your own actions are not news to you.
  if (String(recipientId) === String(actorId)) return null;
  if (await isBlockedBetween(recipientId, actorId)) return null;

  const groupKey = groupKeyFor({ type, postId, actorId });

  const notification = await Notification.findOneAndUpdate(
    { recipient: recipientId, groupKey },
    {
      $set: { type, post: postId, read: false, updatedAt: new Date() },
      // Re-liking after an unlike should move the actor to the front rather
      // than list them twice.
      $pull: { actors: actorId },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // $pull and $push on the same field in one update is rejected by Mongo, so
  // the reordering takes a second write.
  await Notification.updateOne(
    { _id: notification._id },
    { $push: { actors: { $each: [actorId], $position: 0, $slice: 20 } } }
  );

  const fresh = await Notification.findById(notification._id)
    .populate('actors', 'handle displayName avatar')
    .populate('post', 'text media')
    .lean();

  const unreadCount = await Notification.countDocuments({ recipient: recipientId, read: false });

  const payload = {
    id: fresh._id,
    type: fresh.type,
    read: fresh.read,
    createdAt: fresh.createdAt,
    updatedAt: fresh.updatedAt,
    actors: (fresh.actors ?? []).map(({ _id, ...rest }) => ({ id: _id, ...rest })),
    post: fresh.post ? { id: fresh.post._id, text: fresh.post.text, media: fresh.post.media } : null,
  };

  emitToUser(recipientId, 'notification:new', { notification: payload, unreadCount });

  return payload;
};

export const removeNotification = async ({ recipientId, actorId, type, postId = null }) => {
  const groupKey = groupKeyFor({ type, postId, actorId });
  const doc = await Notification.findOneAndUpdate(
    { recipient: recipientId, groupKey },
    { $pull: { actors: actorId } },
    { new: true }
  );
  // The last actor leaving means there is nothing left to notify about.
  if (doc && doc.actors.length === 0) await Notification.deleteOne({ _id: doc._id });
};

export const unreadCount = (recipientId) =>
  Notification.countDocuments({ recipient: recipientId, read: false });
