import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthProvider.jsx';

const SocketContext = createContext(null);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used inside SocketProvider');
  return context;
};

const SOCKET_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5007/api/v1').replace(
  /\/api\/v1\/?$/,
  ''
);

export const SocketProvider = ({ children }) => {
  const { token, user } = useAuth();
  // The live socket, held as state rather than a ref.
  //
  // It was a ref, read inside the `value` memo, which meant the memo only
  // picked the instance up if some *other* dependency happened to change
  // afterwards. That worked by luck while `io()` was called synchronously.
  // With the client now imported on demand the instance arrives a tick later,
  // and a ref would leave every consumer holding the no-op `on` it was given
  // before the connection existed — subscriptions silently attached to
  // nothing. As state, the memo recomputes when the socket lands and each
  // consumer's effect (all of them key on `on`) re-attaches for real.
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState('idle');
  const [onlineUsers, setOnlineUsers] = useState(() => new Set());

  useEffect(() => {
    // No session means no socket. The connection carries the identity, so there
    // is nothing meaningful to open before sign-in.
    if (!token || !user) {
      setSocket(null);
      setStatus('idle');
      return undefined;
    }

    setStatus('connecting');

    /*
     * socket.io-client is ~40KB of the entry bundle and is worth nothing until
     * someone is signed in. Imported here, a signed-out visitor — every
     * first-time reader, and every crawler — never downloads it, and it is
     * fetched in parallel with the first authenticated screen rather than
     * ahead of the landing page's own paint.
     */
    let active = true;
    let instance = null;
    let heartbeat = null;

    const connect = async () => {
      const { io } = await import('socket.io-client');
      // The session can end, or change accounts, while the chunk is in flight.
      if (!active) return;

      instance = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        // Render's free tier sleeps, so the first connection after an idle period
        // can fail while the service wakes. Backoff rather than giving up.
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 800,
        reconnectionDelayMax: 8000,
      });

      instance.on('ready', () => setStatus('connected'));
      instance.on('disconnect', () => setStatus('reconnecting'));
      instance.on('connect_error', () => setStatus('reconnecting'));

      instance.on('presence:online', ({ userId }) =>
        setOnlineUsers((prev) => new Set(prev).add(userId))
      );
      instance.on('presence:offline', ({ userId }) =>
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        })
      );

      // Keeps lastSeenAt honest for a tab left open all day. The server ignores
      // anything more frequent than once a minute.
      heartbeat = setInterval(() => instance.emit('presence:heartbeat'), 60_000);

      setSocket(instance);
    };

    connect();

    return () => {
      active = false;
      if (heartbeat) clearInterval(heartbeat);
      instance?.close();
      setSocket(null);
    };
  }, [token, user]);

  // Seeds the live presence set from a one-off REST snapshot (a conversation
  // list's `participant.online`, computed server-side at fetch time) rather
  // than trusting that snapshot forever — a caller that ORs a stale REST flag
  // into every render instead of seeding it once here will show someone as
  // online long after they disconnect, since nothing ever re-evaluates a
  // value that was only ever true. `presence:online`/`presence:offline`
  // events are what keep it correct after this initial merge; anyone absent
  // from both the seed and the live set is presumed offline, not the reverse.
  const markOnline = useCallback((ids) => {
    if (!ids || ids.length === 0) return;
    setOnlineUsers((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(String(id));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      socket,
      status,
      onlineUsers,
      markOnline,
      // Subscribing through the provider rather than reaching for the socket
      // directly means a component mounted before the connection settles still
      // gets its listener attached.
      on: (event, handler) => {
        if (!socket) return () => {};
        socket.on(event, handler);
        return () => socket.off(event, handler);
      },
      emit: (...args) => socket?.emit(...args),
    }),
    [socket, status, onlineUsers, markOnline]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export default SocketProvider;
