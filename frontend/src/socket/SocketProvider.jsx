import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
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
  const socketRef = useRef(null);
  const [status, setStatus] = useState('idle');
  const [onlineUsers, setOnlineUsers] = useState(() => new Set());

  useEffect(() => {
    // No session means no socket. The connection carries the identity, so there
    // is nothing meaningful to open before sign-in.
    if (!token || !user) {
      socketRef.current?.close();
      socketRef.current = null;
      setStatus('idle');
      return undefined;
    }

    setStatus('connecting');

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      // Render's free tier sleeps, so the first connection after an idle period
      // can fail while the service wakes. Backoff rather than giving up.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 8000,
    });

    socketRef.current = socket;

    socket.on('ready', () => setStatus('connected'));
    socket.on('disconnect', () => setStatus('reconnecting'));
    socket.on('connect_error', () => setStatus('reconnecting'));

    socket.on('presence:online', ({ userId }) =>
      setOnlineUsers((prev) => new Set(prev).add(userId))
    );
    socket.on('presence:offline', ({ userId }) =>
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      })
    );

    // Keeps lastSeenAt honest for a tab left open all day. The server ignores
    // anything more frequent than once a minute.
    const heartbeat = setInterval(() => socket.emit('presence:heartbeat'), 60_000);

    return () => {
      clearInterval(heartbeat);
      socket.close();
      socketRef.current = null;
    };
  }, [token, user]);

  const value = useMemo(
    () => ({
      socket: socketRef.current,
      status,
      onlineUsers,
      // Subscribing through the provider rather than reaching for the socket
      // directly means a component mounted before the connection settles still
      // gets its listener attached.
      on: (event, handler) => {
        const socket = socketRef.current;
        if (!socket) return () => {};
        socket.on(event, handler);
        return () => socket.off(event, handler);
      },
      emit: (...args) => socketRef.current?.emit(...args),
    }),
    [status, onlineUsers]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export default SocketProvider;
