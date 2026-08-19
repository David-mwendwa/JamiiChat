import Conversation from '../../models/conversationModel.js';
import User from '../../models/userModel.js';
import { emitToConversation, emitToUser } from '../emit.js';

// One call at a time per conversation — this is 1:1 voice/video, not a
// conference bridge. Keyed by conversationId so `call:invite` can refuse a
// second ring into a thread that already has one in flight, and so a
// disconnect mid-call knows who else to notify without the client having to
// say who it was talking to.
const activeCalls = new Map();

// How long a ring is allowed to go unanswered before it is treated as a
// missed call rather than staying "ringing" forever if a decline is lost.
const RING_TIMEOUT_MS = 45_000;

const otherParticipant = async (conversationId, userId) => {
  const convo = await Conversation.findOne({ _id: conversationId, participants: userId })
    .select('participants')
    .lean();
  if (!convo) return null;
  return convo.participants.map(String).find((id) => id !== String(userId)) ?? null;
};

const clearRingTimeout = (call) => {
  if (call?.ringTimeout) clearTimeout(call.ringTimeout);
};

const endCall = (conversationId, event, extra = {}) => {
  const call = activeCalls.get(conversationId);
  if (!call) return;
  clearRingTimeout(call);
  activeCalls.delete(conversationId);
  emitToConversation(conversationId, event, { conversationId, ...extra });
};

const registerCallHandlers = (io, socket) => {
  socket.on('call:invite', async ({ conversationId, kind }, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (!conversationId || !['audio', 'video'].includes(kind)) {
      return reply({ ok: false, error: 'invalid call request' });
    }

    const calleeId = await otherParticipant(conversationId, socket.userId);
    if (!calleeId) return reply({ ok: false, error: 'not a participant' });

    if (activeCalls.has(conversationId)) {
      return reply({ ok: false, error: 'busy' });
    }

    const caller = await User.findById(socket.userId)
      .select('handle displayName avatar')
      .lean();

    const ringTimeout = setTimeout(() => {
      endCall(conversationId, 'call:missed');
    }, RING_TIMEOUT_MS);

    activeCalls.set(conversationId, {
      from: socket.userId,
      to: calleeId,
      kind,
      status: 'ringing',
      ringTimeout,
    });

    emitToUser(calleeId, 'call:incoming', { conversationId, kind, from: caller });
    reply({ ok: true });
  });

  // The callee accepting. Only the person being called may accept — the
  // caller accepting their own invite would otherwise "answer" a call to
  // themselves and skip the other side entirely.
  socket.on('call:accept', ({ conversationId }) => {
    const call = activeCalls.get(conversationId);
    if (!call || call.status !== 'ringing' || call.to !== socket.userId) return;
    clearRingTimeout(call);
    call.status = 'active';
    emitToUser(call.from, 'call:accepted', { conversationId });
  });

  socket.on('call:decline', ({ conversationId, reason }) => {
    const call = activeCalls.get(conversationId);
    if (!call || call.to !== socket.userId) return;
    endCall(conversationId, 'call:declined', { reason: reason ?? 'declined' });
  });

  socket.on('call:cancel', ({ conversationId }) => {
    const call = activeCalls.get(conversationId);
    if (!call || call.from !== socket.userId) return;
    endCall(conversationId, 'call:cancelled');
  });

  socket.on('call:end', ({ conversationId }) => {
    const call = activeCalls.get(conversationId);
    if (!call || (call.from !== socket.userId && call.to !== socket.userId)) return;
    endCall(conversationId, 'call:end');
  });

  // Offer, answer and ICE candidates are opaque payloads as far as the server
  // is concerned — it only checks that the sender is actually one half of the
  // call before relaying, and forwards to the other half specifically rather
  // than the whole conversation room, since a call is between two people even
  // when a thread has read-only spectators via a shared link in the future.
  const relay = (event) => (payload = {}) => {
    const { conversationId } = payload;
    const call = activeCalls.get(conversationId);
    if (!call) return;
    const target = call.from === socket.userId ? call.to : call.from;
    if (target !== socket.userId && (call.from === socket.userId || call.to === socket.userId)) {
      emitToUser(target, event, { ...payload, from: socket.userId });
    }
  };

  socket.on('call:offer', relay('call:offer'));
  socket.on('call:answer', relay('call:answer'));
  socket.on('call:ice-candidate', relay('call:ice-candidate'));

  socket.on('disconnect', () => {
    for (const [conversationId, call] of activeCalls) {
      if (call.from === socket.userId || call.to === socket.userId) {
        endCall(conversationId, 'call:end', { reason: 'disconnected' });
      }
    }
  });
};

export default registerCallHandlers;
