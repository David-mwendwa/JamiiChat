import mongoose from 'mongoose';
import Conversation from '../models/conversationModel.js';
import Message from '../models/messageModel.js';
import { emitToUser } from '../socket/emit.js';

// Marks everything addressed to `userId` as delivered, and tells each sender.
//
// Delivery cannot always be decided when a message is written: if the
// recipient had no live socket, nothing reached them. This runs when they
// reconnect, which is the moment it becomes true. Without it a message sent to
// someone with a closed tab would stay on a single tick permanently, even
// after they came back and read it.
export const backfillDelivered = async (userId) => {
  const id = new mongoose.Types.ObjectId(String(userId));

  const conversations = await Conversation.find({ participants: id }).select('_id').lean();
  if (conversations.length === 0) return 0;

  const conversationIds = conversations.map((c) => c._id);
  const now = new Date();

  const pending = await Message.find({
    conversation: { $in: conversationIds },
    sender: { $ne: id },
    deliveredAt: null,
  })
    .select('_id conversation sender')
    .lean();

  if (pending.length === 0) return 0;

  await Message.updateMany(
    { _id: { $in: pending.map((m) => m._id) } },
    { $set: { deliveredAt: now } }
  );

  // One event per sender per conversation rather than one per message: a
  // backlog of forty messages is one state change to draw, not forty.
  const bySender = new Map();
  for (const m of pending) {
    const key = `${m.sender}:${m.conversation}`;
    if (!bySender.has(key)) bySender.set(key, { sender: m.sender, conversation: m.conversation });
  }

  for (const { sender, conversation } of bySender.values()) {
    emitToUser(sender, 'message:delivered', {
      conversationId: String(conversation),
      deliveredAt: now,
    });
  }

  return pending.length;
};

export default backfillDelivered;
