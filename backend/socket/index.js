import { Server } from 'socket.io';
import User from '../models/userModel.js';
import { userFromToken } from '../middleware/auth.js';
import {
  registerIO,
  roomForUser,
  trackConnection,
  releaseConnection,
  onlineAmong,
} from './emit.js';
import { backfillDelivered } from '../services/delivery.js';
import registerMessageHandlers from './handlers/messages.js';
import registerPresenceHandlers from './handlers/presence.js';
import registerCallHandlers from './handlers/calls.js';

export const initSocket = (httpServer, { allowedOrigins }) => {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins, credentials: true },
    // Long enough to survive a phone locking or a laptop lid closing, short
    // enough that a genuinely gone client frees its room.
    pingTimeout: 30000,
  });

  // Authentication happens once, at the handshake, using the same token
  // verification the HTTP middleware uses. A second auth mechanism would be a
  // second thing to get wrong — and would let a suspended account keep a live
  // socket after its API access was cut off.
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers.authorization?.startsWith('Bearer ')
          ? socket.handshake.headers.authorization.slice(7)
          : null);

      const user = await userFromToken(token);
      if (!user) return next(new Error('unauthorized'));

      socket.userId = String(user._id);
      socket.handle = user.handle;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    // The room is derived from the verified handshake, never from anything the
    // client sends afterwards.
    socket.join(roomForUser(socket.userId));

    const becameOnline = trackConnection(socket.userId);
    if (becameOnline) {
      await User.findByIdAndUpdate(socket.userId, { lastSeenAt: new Date() });
      socket.broadcast.emit('presence:online', { userId: socket.userId });
    }

    socket.emit('ready', { userId: socket.userId });

    // Anything sent while this person was offline could not be marked
    // delivered at write time. Settling it on reconnect is what stops a
    // message sitting on a single tick forever just because the recipient's
    // tab was closed when it arrived — and it tells each sender, so their
    // ticks move without needing to reopen the thread.
    backfillDelivered(socket.userId).catch(() => {});

    socket.on('presence:who', (userIds = [], ack) => {
      if (typeof ack === 'function') ack(onlineAmong(userIds));
    });

    registerMessageHandlers(io, socket);
    registerPresenceHandlers(io, socket);
    registerCallHandlers(io, socket);

    socket.on('disconnect', async () => {
      const wentOffline = releaseConnection(socket.userId);
      if (wentOffline) {
        await User.findByIdAndUpdate(socket.userId, { lastSeenAt: new Date() });
        socket.broadcast.emit('presence:offline', {
          userId: socket.userId,
          lastSeenAt: new Date(),
        });
      }
    });
  });

  registerIO(io);
  return io;
};

export default initSocket;
