// Holds the io instance so services can emit without importing the socket
// bootstrap — that import would be circular, since the bootstrap imports the
// same services to handle incoming events.

let io = null;

// Tracks how many live sockets each user has. A user with three tabs open is
// online until the third one closes, so presence cannot be a boolean flipped
// on disconnect.
const connections = new Map();

export const registerIO = (instance) => {
  io = instance;
};

export const getIO = () => io;

export const roomForUser = (userId) => `user:${userId}`;
export const roomForConversation = (conversationId) => `conversation:${conversationId}`;

// Emits to every device that user has open, and to nobody else. Rooms are
// joined server-side from the verified handshake identity, so a client cannot
// subscribe itself to someone else's stream by asking.
export const emitToUser = (userId, event, payload) => {
  if (!io || !userId) return;
  io.to(roomForUser(userId)).emit(event, payload);
};

export const emitToConversation = (conversationId, event, payload, { except } = {}) => {
  if (!io || !conversationId) return;
  // `.except()` returns a NEW broadcast operator rather than mutating the one
  // it was called on. Calling it for its side effect silently discarded the
  // exclusion, so an event meant for "everyone but the sender" went to the
  // sender too — which made your own typing indicator come back at you as if
  // the other person were typing.
  const room = io.to(roomForConversation(conversationId));
  const target = except ? room.except(roomForUser(except)) : room;
  target.emit(event, payload);
};

export const trackConnection = (userId) => {
  const key = String(userId);
  const next = (connections.get(key) ?? 0) + 1;
  connections.set(key, next);
  // Only the first connection is a transition from offline to online.
  return next === 1;
};

export const releaseConnection = (userId) => {
  const key = String(userId);
  const next = (connections.get(key) ?? 1) - 1;
  if (next <= 0) {
    connections.delete(key);
    return true;
  }
  connections.set(key, next);
  return false;
};

export const isOnline = (userId) => connections.has(String(userId));

export const onlineAmong = (userIds = []) =>
  userIds.map(String).filter((id) => connections.has(id));
