import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import Icon from '../components/ui/Icon.jsx';
import PostCard from '../components/post/PostCard.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import FollowButton from '../components/profile/FollowButton.jsx';
import useDebounce from '../hooks/useDebounce.js';
import { compactCount } from '../lib/format.js';
import { searchApi } from '../api/index.js';

const TABS = [
  ['all', 'All'],
  ['people', 'People'],
  ['posts', 'Posts'],
  ['tags', 'Tags'],
];

const SearchPage = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [tab, setTab] = useState('all');
  const [results, setResults] = useState({ users: [], posts: [], hashtags: [] });
  const [loading, setLoading] = useState(false);

  const debounced = useDebounce(query, 300);

  useEffect(() => {
    const term = debounced.trim();
    if (term.length < 2) {
      setResults({ users: [], posts: [], hashtags: [] });
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setParams({ q: term }, { replace: true });

    searchApi
      .query(term, { limit: 20 })
      .then(({ data }) => {
        if (cancelled) return;
        setResults({ users: data.users, posts: data.posts, hashtags: data.hashtags });
      })
      .catch(() => !cancelled && setResults({ users: [], posts: [], hashtags: [] }))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [debounced, setParams]);

  const total = results.users.length + results.posts.length + results.hashtags.length;
  const showPeople = tab === 'all' || tab === 'people';
  const showPosts = tab === 'all' || tab === 'posts';
  const showTags = tab === 'all' || tab === 'tags';

  return (
    <>
      <PageHeader title="Search" back />

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
            placeholder="Search people, posts and tags"
            aria-label="Search"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            className="field rounded-full bg-sunken pl-10 dark:bg-dark-900"
          />
        </div>
      </div>

      <div className="divider flex">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-current={tab === value}
            className="group relative flex-1 py-3 text-sm font-semibold transition hover:bg-sunken">
            <span className={tab === value ? '' : 'text-muted'}>{label}</span>
            {tab === value && (
              <span className="absolute inset-x-0 bottom-0 mx-auto h-[3px] w-10 rounded-full bg-primary-600" />
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {!loading && query.trim().length < 2 && (
        <EmptyState
          title="Search JamiiChat"
          description="Type at least two characters to find people, posts and hashtags."
        />
      )}

      {!loading && query.trim().length >= 2 && total === 0 && (
        <EmptyState
          title={`No results for "${query.trim()}"`}
          description="Try a different spelling, or search for a hashtag instead."
        />
      )}

      {!loading && showTags && results.hashtags.length > 0 && (
        <section>
          <h2 className="divider px-4 py-2.5 text-base">Tags</h2>
          <ul>
            {results.hashtags.map((item) => (
              <li key={item.tag}>
                <Link
                  to={`/tag/${item.tag}`}
                  className="divider block px-4 py-3 transition hover:bg-sunken">
                  <p className="font-heading font-bold">#{item.tag}</p>
                  <p className="metric text-xs text-muted">
                    {compactCount(item.posts)} {item.posts === 1 ? 'post' : 'posts'}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!loading && showPeople && results.users.length > 0 && (
        <section>
          <h2 className="divider px-4 py-2.5 text-base">People</h2>
          <ul>
            {results.users.map((person) => (
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
        </section>
      )}

      {!loading && showPosts && results.posts.length > 0 && (
        <section>
          <h2 className="divider px-4 py-2.5 text-base">Posts</h2>
          {results.posts.map((post) => (
            <PostCard key={post.id} post={post} onReply={(p) => navigate(`/post/${p.id}`)} />
          ))}
        </section>
      )}
    </>
  );
};

export default SearchPage;
