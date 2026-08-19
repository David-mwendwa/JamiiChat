import { useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import Icon from '../components/ui/Icon.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import useInfiniteFeed from '../hooks/useInfiniteFeed.js';
import useIntersection from '../hooks/useIntersection.js';
import cn from '../lib/cn.js';
import { relativeTime } from '../lib/format.js';
import { notificationApi } from '../api/index.js';
import { useSocket } from '../socket/SocketProvider.jsx';
import { useLive } from '../context/LiveProvider.jsx';

const ICONS = {
  like: { name: 'heart', tone: 'text-rose-500' },
  reply: { name: 'reply', tone: 'text-primary-500' },
  repost: { name: 'repost', tone: 'text-emerald-500' },
  quote: { name: 'repost', tone: 'text-emerald-500' },
  follow: { name: 'user', tone: 'text-primary-500' },
  follow_back: { name: 'user', tone: 'text-primary-500' },
  follow_request: { name: 'user', tone: 'text-secondary-500' },
  mention: { name: 'reply', tone: 'text-primary-500' },
};

// One document holds every actor, so the sentence is built from the count
// rather than repeated once per person.
const describe = (notification) => {
  const [first, ...rest] = notification.actors;
  const others = rest.length;
  const who = others === 0 ? first.displayName : `${first.displayName} and ${others} other${others > 1 ? 's' : ''}`;

  switch (notification.type) {
    case 'like':
      return `${who} liked your post`;
    case 'reply':
      return `${who} replied to your post`;
    case 'repost':
      return `${who} reposted your post`;
    case 'quote':
      return `${who} quoted your post`;
    case 'follow':
      return `${who} followed you`;
    case 'follow_back':
      return `${who} followed you back`;
    case 'follow_request':
      return `${who} asked to follow you`;
    case 'mention':
      return `${who} mentioned you`;
    default:
      return `${who} interacted with your post`;
  }
};

const NotificationsPage = () => {
  const { on } = useSocket();
  const { setNotificationCount } = useLive();

  const fetcher = useCallback(async (cursor) => {
    const { data } = await notificationApi.list({ cursor, limit: 20 });
    return { items: data.items, nextCursor: data.nextCursor };
  }, []);

  const feed = useInfiniteFeed(fetcher, [], 'feed:notifications');
  const sentinel = useIntersection(feed.loadMore);

  // Opening the page is reading them.
  useEffect(() => {
    notificationApi
      .markAllRead()
      .then(() => setNotificationCount(0))
      .catch(() => {});
  }, [setNotificationCount]);

  // A notification arriving while the page is open goes straight to the top,
  // rather than waiting for a refresh to reveal it.
  useEffect(() => {
    const off = on('notification:new', ({ notification }) => {
      feed.setItems((prev) => [notification, ...prev.filter((n) => n.id !== notification.id)]);
      notificationApi.markAllRead().catch(() => {});
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  return (
    <>
      <PageHeader title="Notifications" />

      {feed.loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : feed.items.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          description="When someone likes, replies to or follows you, it shows up here."
        />
      ) : (
        <ul>
          {feed.items.map((notification) => {
            const icon = ICONS[notification.type] ?? ICONS.like;
            const target = notification.post ? `/post/${notification.post.id}` : `/${notification.actors[0]?.handle}`;

            return (
              <li key={notification.id}>
                <Link
                  to={target}
                  className={cn(
                    'divider flex gap-3 px-4 py-3.5 transition hover:bg-sunken',
                    !notification.read && 'bg-primary-50/60 dark:bg-primary-950/20'
                  )}>
                  <Icon name={icon.name} filled className={cn('mt-0.5 h-5 w-5 shrink-0', icon.tone)} />

                  <div className="min-w-0 flex-1">
                    <div className="flex -space-x-1.5">
                      {notification.actors.slice(0, 5).map((actor) => (
                        <Avatar key={actor.id} user={actor} size="xs" link={false} />
                      ))}
                    </div>
                    <p className="mt-1.5 text-[0.9375rem]">
                      <span className="font-bold">{describe(notification)}</span>
                    </p>
                    {notification.post?.text && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted">
                        {notification.post.text}
                      </p>
                    )}
                    <time className="handle mt-1 block">{relativeTime(notification.updatedAt)}</time>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div ref={sentinel} className="flex justify-center py-8">
        {feed.loadingMore && <Spinner label="Loading more" />}
      </div>
    </>
  );
};

export default NotificationsPage;
