import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import FollowButton from '../components/profile/FollowButton.jsx';
import useInfiniteFeed from '../hooks/useInfiniteFeed.js';
import useIntersection from '../hooks/useIntersection.js';
import { userApi } from '../api/index.js';

// Followers and following are the same screen with a different endpoint.
const ConnectionsPage = ({ mode }) => {
  const { handle } = useParams();

  const fetcher = useCallback(
    async (cursor) => {
      const request = mode === 'followers' ? userApi.followers : userApi.following;
      const { data } = await request(handle, { cursor, limit: 20 });
      return { items: data.items, nextCursor: data.nextCursor };
    },
    [handle, mode]
  );

  const feed = useInfiniteFeed(fetcher, [handle, mode], `feed:connections:${handle}:${mode}`);
  const sentinel = useIntersection(feed.loadMore);

  return (
    <>
      <PageHeader
        title={mode === 'followers' ? 'Followers' : 'Following'}
        subtitle={`@${handle}`}
        back
      />

      {feed.loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : feed.items.length === 0 ? (
        <EmptyState
          title={mode === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
          description={
            mode === 'followers'
              ? 'When people follow this account, they show up here.'
              : 'Accounts this person follows will show up here.'
          }
        />
      ) : (
        <ul>
          {feed.items.map((person) => (
            <li key={person.id} className="divider flex items-center gap-3 px-4 py-3">
              <Avatar user={person} size="md" />
              <div className="min-w-0 flex-1">
                <Link to={`/${person.handle}`} className="block truncate font-bold hover:underline">
                  {person.displayName}
                </Link>
                <p className="handle truncate">@{person.handle}</p>
                {person.bio && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted">
                    {person.bio}
                  </p>
                )}
              </div>
              <FollowButton handle={person.handle} size="sm" initialState={person.relationship} />
            </li>
          ))}
        </ul>
      )}

      <div ref={sentinel} className="flex justify-center py-8">
        {feed.loadingMore && <Spinner label="Loading more" />}
      </div>
    </>
  );
};

export default ConnectionsPage;
