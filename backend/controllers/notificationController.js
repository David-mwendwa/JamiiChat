import { StatusCodes } from 'http-status-codes';
import Notification from '../models/notificationModel.js';
import { clampLimit, paginate, cursorFilter, decodeCursor } from '../utils/cursor.js';
import { unreadCount } from '../services/notify.js';
import { emitToUser } from '../socket/emit.js';
import { serializeUser } from '../services/feed.js';

// Same `_id` → `id` normalisation the post and user payloads use, so the
// client reads one identifier field everywhere.
const serializeNotification = (n) => {
  const { _id, __v, actors, post, ...rest } = n;
  return {
    id: _id,
    ...rest,
    actors: (actors ?? []).map(serializeUser),
    post: post ? { id: post._id, text: post.text, media: post.media } : null,
  };
};

export const listNotifications = async (req, res) => {
  const filter = {
    recipient: req.user._id,
    ...cursorFilter(decodeCursor(req.query.cursor)),
  };

  const { items, nextCursor } = await paginate(
    Notification.find(filter)
      .populate('actors', 'handle displayName avatar')
      .populate('post', 'text media')
      .lean(),
    { cursor: req.query.cursor, limit: clampLimit(req.query.limit) }
  );

  res.status(StatusCodes.OK).json({
    status: 'success',
    items: items.map(serializeNotification),
    nextCursor,
    unreadCount: await unreadCount(req.user._id),
  });
};

export const getUnreadCount = async (req, res) => {
  res
    .status(StatusCodes.OK)
    .json({ status: 'success', unreadCount: await unreadCount(req.user._id) });
};

export const markAllRead = async (req, res) => {
  await Notification.updateMany({ recipient: req.user._id, read: false }, { read: true });
  // Other tabs are showing the same badge and need to clear it too.
  emitToUser(req.user._id, 'notification:read', { unreadCount: 0 });
  res.status(StatusCodes.OK).json({ status: 'success', unreadCount: 0 });
};

export const markOneRead = async (req, res) => {
  await Notification.updateOne(
    { _id: req.params.id, recipient: req.user._id },
    { read: true }
  );
  const count = await unreadCount(req.user._id);
  emitToUser(req.user._id, 'notification:read', { unreadCount: count });
  res.status(StatusCodes.OK).json({ status: 'success', unreadCount: count });
};
