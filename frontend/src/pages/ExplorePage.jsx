import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader.jsx';
import FeedList from '../components/feed/FeedList.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Icon from '../components/ui/Icon.jsx';
import useInfiniteFeed from '../hooks/useInfiniteFeed.js';
import { feedApi } from '../api/index.js';

const ExplorePage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');

  const fetcher = useCallback(async (cursor) => {
    const page = cursor ? Number(cursor) : 0;
    const { data } = await feedApi.explore({ page, limit: 20 });
    return {
      items: data.items,
      nextCursor: data.nextPage != null ? String(data.nextPage) : null,
    };
  }, []);

  const feed = useInfiniteFeed(fetcher, [], 'feed:explore');

  const submit = (event) => {
    event.preventDefault();
    if (query.trim().length >= 2) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <>
      <PageHeader title="Explore" subtitle="Ranked by what people are engaging with" />

      <form onSubmit={submit} role="search" className="divider p-3 lg:hidden">
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search JamiiChat"
            aria-label="Search JamiiChat"
            className="field rounded-full bg-sunken pl-10 dark:bg-dark-900"
          />
        </div>
      </form>

      <FeedList
        feed={feed}
        onReply={(post) => navigate(`/post/${post.id}`)}
        empty={<EmptyState title="Nothing to explore yet" description="Posts show up here as people start writing." />}
      />
    </>
  );
};

export default ExplorePage;
