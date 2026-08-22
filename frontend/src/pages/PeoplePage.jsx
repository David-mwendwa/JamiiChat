import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import Icon from '../components/ui/Icon.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import FollowButton from '../components/profile/FollowButton.jsx';
import useInfiniteFeed from '../hooks/useInfiniteFeed.js';
import useIntersection from '../hooks/useIntersection.js';
import useDebounce from '../hooks/useDebounce.js';
import { userApi } from '../api/index.js';

// The full member directory — everyone on JamiiChat, not just people you
// don't already follow (that's the "who to follow" widget elsewhere). Search
// narrows the same list in place rather than sending the reader to a
// different screen, since "is there anyone called..." is the same question
// as "let me see who's here" with a few characters typed.
const PeoplePage = () => {
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 300);

  const fetcher = useCallback(
    async (cursor) => {
      const { data } = await userApi.list({ cursor, limit: 20, q: debounced.trim() || undefined });
      return { items: data.items, nextCursor: data.nextCursor };
    },
    [debounced]
  );

  const feed = useInfiniteFeed(fetcher, [debounced], debounced ? null : 'feed:people');
  const sentinel = useIntersection(feed.loadMore);

  return (
    <>
      <PageHeader title="People" subtitle="Everyone on JamiiChat" back />

      <div className="divider p-3">
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or @handle"
            aria-label="Search people"
            className="field rounded-full bg-sunken pl-10 dark:bg-dark-900"
          />
        </div>
      </div>

      {feed.loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : feed.items.length === 0 ? (
        <EmptyState
          title={debounced ? `No one matches "${debounced.trim()}"` : 'No one here yet'}
          description={
            debounced
              ? 'Try a different spelling, or just their first name.'
              : 'New accounts will show up here as people join.'
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
                {person.bio && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{person.bio}</p>}
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

export default PeoplePage;
