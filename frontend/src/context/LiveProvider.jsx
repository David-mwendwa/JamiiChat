import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { notificationApi, messageApi } from '../api/index.js';
import { useAuth } from './AuthProvider.jsx';
import { useSocket } from '../socket/SocketProvider.jsx';

const LiveContext = createContext(null);

export const useLive = () => {
  const context = useContext(LiveContext);
  if (!context) throw new Error('useLive must be used inside LiveProvider');
  return context;
};

// Holds the two unread counters the whole shell renders, and keeps them true
// over the socket. Without this the badges would only be right immediately
// after a page load.
export const LiveProvider = ({ children }) => {
  const { user } = useAuth();
  const { on } = useSocket();
  const [notificationCount, setNotificationCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const [latestNotification, setLatestNotification] = useState(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [notes, messages] = await Promise.all([
        notificationApi.unread(),
        messageApi.unread(),
      ]);
      setNotificationCount(notes.data.unreadCount ?? 0);
      setMessageCount(messages.data.unread ?? 0);
    } catch {
      // A failed count refresh leaves the previous badge in place rather than
      // showing a wrong zero.
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotificationCount(0);
      setMessageCount(0);
      return;
    }
    refresh();
  }, [user, refresh]);

  useEffect(() => {
    if (!user) return undefined;

    const offNew = on('notification:new', ({ notification, unreadCount }) => {
      setNotificationCount(unreadCount ?? 0);
      setLatestNotification(notification);
    });

    const offRead = on('notification:read', ({ unreadCount }) =>
      setNotificationCount(unreadCount ?? 0)
    );

    // Fires on the recipient's other tabs, so the conversation list badge moves
    // even on a screen that is not showing that thread.
    const offConversation = on('conversation:updated', () =>
      setMessageCount((prev) => prev + 1)
    );

    return () => {
      offNew();
      offRead();
      offConversation();
    };
  }, [user, on]);

  const value = useMemo(
    () => ({
      notificationCount,
      messageCount,
      latestNotification,
      setNotificationCount,
      setMessageCount,
      refresh,
    }),
    [notificationCount, messageCount, latestNotification, refresh]
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
};

export default LiveProvider;
