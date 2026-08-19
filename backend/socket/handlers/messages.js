import Conversation from '../../models/conversationModel.js';
import { roomForConversation, emitToConversation, emitToUser } from '../emit.js';

// Membership is checked here, server-side, before a socket is allowed into a
// conversation room. A client asking to join a room is a request, not a fact —
// trusting the id it sends would let anyone read any thread.
const canJoin = async (conversationId, userId) => {
  const convo = await Conversation.findOne({
    _id: conversationId,
    participants: userId,
  })
    .select('_id')
    .lean();
  return Boolean(convo);
};

const registerMessageHandlers = (io, socket) => {
  socket.on('conversation:join', async (conversationId, ack) => {
    try {
      if (!(await canJoin(conversationId, socket.userId))) {
        if (typeof ack === 'function') ack({ ok: false, error: 'not a participant' });
        return;
      }
      socket.join(roomForConversation(conversationId));
      if (typeof ack === 'function') ack({ ok: true });
    } catch {
      if (typeof ack === 'function') ack({ ok: false, error: 'could not open that conversation' });
    }
  });

  socket.on('conversation:leave', (conversationId) => {
    socket.leave(roomForConversation(conversationId));
  });

  // Typing state is deliberately not persisted — it is only meaningful to
  // whoever is looking at the thread right now.
  socket.on('typing:start', async ({ conversationId }) => {
    if (!conversationId) return;
    if (!socket.rooms.has(roomForConversation(conversationId))) return;
    emitToConversation(
      conversationId,
      'typing:start',
      { conversationId, userId: socket.userId },
      { except: socket.userId }
    );
  });

  socket.on('typing:stop', ({ conversationId }) => {
    if (!conversationId) return;
    emitToConversation(
      conversationId,
      'typing:stop',
      { conversationId, userId: socket.userId },
      { except: socket.userId }
    );
  });

  // Delivery acknowledgement travels over the socket; the durable read state is
  // written by the REST route, so a dropped socket cannot lose it.
  socket.on('message:seen', ({ conversationId, messageId }) => {
    if (!conversationId) return;
    emitToConversation(
      conversationId,
      'message:seen',
      { conversationId, messageId, userId: socket.userId },
      { except: socket.userId }
    );
  });

  socket.on('conversation:ping', ({ userId }) => {
    if (userId) emitToUser(userId, 'conversation:ping', { from: socket.userId });
  });
};

export default registerMessageHandlers;
