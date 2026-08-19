import User from '../../models/userModel.js';

// Heartbeat from an open tab. Without it, a user who leaves the app open all
// day shows a lastSeenAt from whenever they first connected.
const HEARTBEAT_MS = 60 * 1000;

const registerPresenceHandlers = (io, socket) => {
  let last = 0;

  socket.on('presence:heartbeat', async () => {
    const now = Date.now();
    // Rate-limited server-side: a client sending this every 100ms would
    // otherwise write to the users collection every 100ms.
    if (now - last < HEARTBEAT_MS) return;
    last = now;
    await User.findByIdAndUpdate(socket.userId, { lastSeenAt: new Date(now) });
  });
};

export default registerPresenceHandlers;
