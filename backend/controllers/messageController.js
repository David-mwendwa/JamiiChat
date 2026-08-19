import { StatusCodes } from 'http-status-codes';
import mongoose from 'mongoose';
import Conversation, { pairKeyFor } from '../models/conversationModel.js';
import Message, { canStillEdit, EDIT_WINDOW_MS } from '../models/messageModel.js';
import User from '../models/userModel.js';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../errors/customErrors.js';
import { isBlockedBetween } from '../services/visibility.js';
import { preview } from '../utils/text.js';
import { clampLimit, paginate, cursorFilter, decodeCursor } from '../utils/cursor.js';
import { uploadMessageMedia, processImage, saveAudio } from '../middleware/upload.js';
import {
  emitToUser,
  emitToConversation,
  roomForConversation,
  getIO,
  isOnline,
} from '../socket/emit.js';

// Participants are stored sorted so the pair (a, b) and (b, a) produce the
// same array; the unique `pairKey` alongside it is what actually guarantees one
// conversation per pair. See the model for why the array itself cannot.
const sortedParticipants = (a, b) =>
  [String(a), String(b)].sort().map((id) => new mongoose.Types.ObjectId(id));

const shape = (convo, viewerId) => {
  const other = convo.participants.find((p) => String(p._id ?? p) !== String(viewerId));
  const unread = convo.unread instanceof Map ? convo.unread.get(String(viewerId)) : convo.unread?.[String(viewerId)];
  return {
    id: convo._id,
    participant: other?._id
      ? {
          id: other._id,
          handle: other.handle,
          displayName: other.displayName,
          avatar: other.avatar,
          online: isOnline(other._id),
          lastSeenAt: other.lastSeenAt,
        }
      : null,
    lastMessagePreview: convo.lastMessagePreview,
    lastMessageAt: convo.lastMessageAt,
    unread: unread ?? 0,
  };
};

export const listConversations = async (req, res) => {
  const rows = await Conversation.find({
    participants: req.user._id,
    hiddenFor: { $ne: req.user._id },
  })
    .populate('participants', 'handle displayName avatar lastSeenAt')
    .sort({ lastMessageAt: -1 })
    .limit(50)
    .lean();

  res
    .status(StatusCodes.OK)
    .json({ status: 'success', items: rows.map((c) => shape(c, req.user._id)) });
};

// "Delete chat" for just this participant. Membership is still required —
// hiding a conversation you are not part of is not a thing a stranger's
// account should be able to do, even though it has no visible effect on the
// other participant either way.
export const hideConversation = async (req, res) => {
  const convo = await assertParticipant(req.params.id, req.user._id);
  await Conversation.updateOne({ _id: convo._id }, { $addToSet: { hiddenFor: req.user._id } });
  res.status(StatusCodes.OK).json({ status: 'success' });
};

export const openConversation = async (req, res) => {
  const other = await User.findOne({ handle: String(req.params.handle).toLowerCase() });
  if (!other) throw new NotFoundError('No account with that username');
  if (String(other._id) === String(req.user._id))
    throw new BadRequestError('You cannot message yourself');

  if (await isBlockedBetween(req.user._id, other._id))
    throw new UnauthorizedError('You cannot message that account');

  const participants = sortedParticipants(req.user._id, other._id);
  const key = pairKeyFor(req.user._id, other._id);

  const convo = await Conversation.findOneAndUpdate(
    { pairKey: key },
    { $setOnInsert: { participants, pairKey: key, lastMessageAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate('participants', 'handle displayName avatar lastSeenAt');

  res.status(StatusCodes.OK).json({ status: 'success', conversation: shape(convo, req.user._id) });
};

// What the conversation list should show for a thread, recomputed from
// whatever its newest surviving message actually is.
//
// This is the part an edit/delete feature gets wrong: the preview is
// denormalised onto the conversation, so editing or deleting the newest
// message leaves the Messages screen still showing the original text — a
// "deleted" message stays fully readable one screen away.
const previewFor = (message) => {
  if (!message) return '';
  if (message.deletedAt) return 'Message deleted';
  if (message.text) return preview(message.text);
  if (message.mediaDuration != null) return 'Voice message';
  return message.media ? 'Photo' : '';
};

const resyncConversationTail = async (conversationId) => {
  const convo = await Conversation.findById(conversationId);
  if (!convo) return null;

  const newest = await Message.findOne({ conversation: conversationId })
    .sort({ createdAt: -1 })
    .lean();

  convo.lastMessage = newest?._id ?? null;
  convo.lastMessageAt = newest?.createdAt ?? convo.lastMessageAt;
  convo.lastMessagePreview = previewFor(newest);
  await convo.save();
  return convo;
};

const assertParticipant = async (conversationId, userId) => {
  if (!mongoose.isValidObjectId(conversationId))
    throw new NotFoundError('That conversation does not exist');
  const convo = await Conversation.findOne({ _id: conversationId, participants: userId });
  if (!convo) throw new NotFoundError('That conversation does not exist');
  return convo;
};

export const listMessages = async (req, res) => {
  const convo = await assertParticipant(req.params.id, req.user._id);

  const filter = {
    conversation: convo._id,
    hiddenFor: { $ne: req.user._id },
    ...cursorFilter(decodeCursor(req.query.cursor)),
  };

  const { items, nextCursor } = await paginate(
    Message.find(filter).populate('sender', 'handle displayName avatar').lean(),
    { cursor: req.query.cursor, limit: clampLimit(req.query.limit, 30) }
  );

  // Fetched newest-first for the cursor, rendered oldest-first for reading.
  res
    .status(StatusCodes.OK)
    .json({ status: 'success', items: items.reverse(), nextCursor });
};

// `uploadSingle` only engages for a multipart body — a plain JSON send (the
// common case, no attachment) passes straight through it untouched, so one
// route handles both.
export const sendMessage = [
  uploadMessageMedia,
  async (req, res) => {
    const convo = await assertParticipant(req.params.id, req.user._id);
    const other = convo.participants.find((p) => String(p) !== String(req.user._id));

    // Re-checked on every send, not only when the conversation was opened: a
    // block placed mid-thread has to stop the next message.
    if (await isBlockedBetween(req.user._id, other))
      throw new UnauthorizedError('You cannot message that account');

    const text = String(req.body.text ?? '').trim();
    const imageFile = req.files?.image?.[0];
    const audioFile = req.files?.audio?.[0];

    if (!text && !imageFile && !audioFile)
      throw new BadRequestError('Write a message or attach something');

    // Re-encoded through the same pipeline as post images: the stored
    // extension comes from what sharp decodes, never the client filename, and
    // re-encoding strips EXIF along with it. Audio has no such pipeline here —
    // see `saveAudio` — so a voice note is stored as recorded.
    const media = imageFile
      ? (await processImage(imageFile.buffer, 'message')).url
      : audioFile
        ? await saveAudio(audioFile)
        : '';
    const mediaDuration = audioFile ? Number(req.body.duration) || undefined : undefined;

    // "Delivered" is decided here rather than guessed from a later ack: if the
    // recipient has a live socket, the emit below reaches them, so it is true
    // at write time. If they are offline it stays null and the socket connect
    // handler backfills it when they return.
    const recipientOnline = isOnline(other);

    const message = await Message.create({
      conversation: convo._id,
      sender: req.user._id,
      text,
      media,
      mediaDuration,
      deliveredAt: recipientOnline ? new Date() : null,
    });

    convo.lastMessage = message._id;
    convo.lastMessageAt = message.createdAt;
    // An image with no caption has nothing for `preview` to summarise — the
    // conversation list would otherwise fall back to "No messages yet" right
    // after a photo was sent, which reads as the send having failed.
    convo.lastMessagePreview = previewFor(message);
    convo.unread.set(String(other), (convo.unread.get(String(other)) ?? 0) + 1);
    await convo.save();

    // A new message is new activity from the recipient's side, so it clears
    // them back out of `hiddenFor` if they had deleted this chat from their
    // own list — the same way WhatsApp brings a cleared conversation back the
    // moment the other person writes again, rather than swallowing it
    // silently into a list it no longer appears on.
    await Conversation.updateOne({ _id: convo._id }, { $pull: { hiddenFor: other } });

    const populated = await Message.findById(message._id)
      .populate('sender', 'handle displayName avatar')
      .lean();

    // Two emits, deliberately. The conversation room reaches whoever has the
    // thread open; the recipient's user room reaches their other tabs, so the
    // conversation list and unread badge update even on a screen that is not
    // showing this thread.
    emitToConversation(convo._id, 'message:new', { conversationId: String(convo._id), message: populated });
    emitToUser(other, 'conversation:updated', {
      conversationId: String(convo._id),
      preview: convo.lastMessagePreview,
      lastMessageAt: convo.lastMessageAt,
      unread: convo.unread.get(String(other)) ?? 0,
      from: { handle: req.user.handle, displayName: req.user.displayName, avatar: req.user.avatar },
    });

    res.status(StatusCodes.CREATED).json({ status: 'success', message: populated });
  },
];

export const markRead = async (req, res) => {
  const convo = await assertParticipant(req.params.id, req.user._id);

  const now = new Date();
  // Reading a message necessarily means it was delivered. Backfilling here too
  // keeps the receipt monotonic — a message must never show as read while its
  // delivery is still unset, which is what happens if the recipient was
  // offline when it was sent and opens the thread on a fresh page load.
  // A pipeline update, because `deliveredAt` must be filled in only where it
  // is still null — `$min` would not do it (BSON sorts null below every date,
  // so it would keep the null) and a plain `$set` would rewrite delivery times
  // that were already correctly recorded.
  await Message.updateMany(
    { conversation: convo._id, sender: { $ne: req.user._id }, readAt: null },
    [{ $set: { readAt: now, deliveredAt: { $ifNull: ['$deliveredAt', now] } } }]
  );

  convo.unread.set(String(req.user._id), 0);
  await convo.save();

  const other = convo.participants.find((p) => String(p) !== String(req.user._id));
  emitToUser(other, 'message:read', {
    conversationId: String(convo._id),
    readerId: String(req.user._id),
  });

  res.status(StatusCodes.OK).json({ status: 'success', unread: 0 });
};

// Only the author may edit, only inside the window, and the window is checked
// here rather than trusted from the client — a clock the sender controls is
// not a limit.
export const editMessage = async (req, res) => {
  const convo = await assertParticipant(req.params.id, req.user._id);

  const message = await Message.findOne({ _id: req.params.messageId, conversation: convo._id });
  if (!message) throw new NotFoundError('That message does not exist');
  if (String(message.sender) !== String(req.user._id))
    throw new UnauthorizedError('You can only edit your own messages');
  if (message.deletedAt) throw new BadRequestError('That message was deleted');
  if (!canStillEdit(message))
    throw new BadRequestError(
      `Messages can only be edited within ${Math.round(EDIT_WINDOW_MS / 60000)} minutes of sending`
    );

  const text = String(req.body.text ?? '').trim();
  // An edit cannot empty a message — that is what deleting is for, and it
  // would otherwise be a way to leave a blank bubble with no tombstone.
  if (!text && !message.media) throw new BadRequestError('Write a message or delete it instead');

  // An atomic $push rather than reading `message.versions` and reassigning
  // it: the field is `select: false`, so the document in hand never has the
  // prior history loaded, and pushing onto that would silently discard every
  // earlier version instead of appending to it.
  await Message.updateOne(
    { _id: message._id },
    { $push: { versions: { text: message.text, media: message.media, reason: 'edit' } } }
  );

  message.text = text;
  message.editedAt = new Date();
  await message.save();

  const populated = await Message.findById(message._id)
    .populate('sender', 'handle displayName avatar')
    .lean();

  await resyncConversationTail(convo._id);

  emitToConversation(convo._id, 'message:edited', {
    conversationId: String(convo._id),
    message: populated,
  });

  res.status(StatusCodes.OK).json({ status: 'success', message: populated });
};

// Shares its time box with editing, on purpose: this is "delete for
// everyone" — a tombstone the other participant will see — and the same
// 15-minute window that limits rewriting what a message says also limits
// erasing that it was said at all. Past it, `hideMessage` ("delete for me")
// is still available with no time limit, since that one only touches this
// account's own view.
export const deleteMessage = async (req, res) => {
  const convo = await assertParticipant(req.params.id, req.user._id);

  const message = await Message.findOne({ _id: req.params.messageId, conversation: convo._id });
  if (!message) throw new NotFoundError('That message does not exist');
  if (String(message.sender) !== String(req.user._id))
    throw new UnauthorizedError('You can only delete your own messages');
  if (!message.deletedAt && !canStillEdit(message))
    throw new BadRequestError(
      `Messages can only be deleted for everyone within ${Math.round(EDIT_WINDOW_MS / 60000)} minutes of sending`
    );

  if (!message.deletedAt) {
    await Message.updateOne(
      { _id: message._id },
      { $push: { versions: { text: message.text, media: message.media, reason: 'delete' } } }
    );

    message.deletedAt = new Date();
    // The content goes, the row stays. Leaving the text in place would mean a
    // "deleted" message is still sitting in the database and still served to
    // anyone who reads the API response rather than the rendered bubble.
    message.text = '';
    message.media = '';
    await message.save();
  }

  const populated = await Message.findById(message._id)
    .populate('sender', 'handle displayName avatar')
    .lean();

  await resyncConversationTail(convo._id);

  emitToConversation(convo._id, 'message:deleted', {
    conversationId: String(convo._id),
    message: populated,
  });

  res.status(StatusCodes.OK).json({ status: 'success', message: populated });
};

// "Delete for me" — hides a message from this participant's own view of the
// thread without touching the shared record, so it works on either side's
// messages, and on one already tombstoned by the other person's delete.
// Nothing is emitted over the socket: the whole point is that only the
// requester's own view changes.
export const hideMessage = async (req, res) => {
  const convo = await assertParticipant(req.params.id, req.user._id);

  const result = await Message.updateOne(
    { _id: req.params.messageId, conversation: convo._id },
    { $addToSet: { hiddenFor: req.user._id } }
  );
  if (!result.matchedCount) throw new NotFoundError('That message does not exist');

  res.status(StatusCodes.OK).json({ status: 'success' });
};

export const unreadTotal = async (req, res) => {
  const rows = await Conversation.find({ participants: req.user._id }).select('unread').lean();
  const total = rows.reduce((sum, c) => sum + (c.unread?.[String(req.user._id)] ?? 0), 0);
  res.status(StatusCodes.OK).json({ status: 'success', unread: total });
};

// Used by the socket join guard's REST counterpart, so the frontend can
// pre-join a room it is about to render.
export const conversationRoom = (id) => roomForConversation(id);
export const socketReady = () => Boolean(getIO());
