import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader.jsx';
import Composer from '../components/post/Composer.jsx';
import FeedList from '../components/feed/FeedList.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import useInfiniteFeed from '../hooks/useInfiniteFeed.js';
import { feedApi } from '../api/index.js';

const HomePage = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState('following');

  const fetcher = useCallback(
    async (cursor) => {
      if (tab === 'following') {
        const { data } = await feedApi.home({ cursor, limit: 20 });
        return { items: data.items, nextCursor: data.nextCursor };
      }
      // Explore is ranked by a computed score, so it pages by position rather
      // than by keyset cursor — the sort key is not stored on the document.
      const page = cursor ? Number(cursor) : 0;
      const { data } = await feedApi.explore({ page, limit: 20 });
      return { items: data.items, nextCursor: data.nextPage != null ? String(data.nextPage) : null };
    },
    [tab]
  );

  const feed = useInfiniteFeed(fetcher, [tab], `feed:home:${tab}`);

  return (
    <>
      <PageHeader title="Home" />

      <div className="divider sticky top-[var(--header-h)] z-10 flex glass">
        {[
          ['following', 'Following'],
          ['explore', 'For you'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-current={tab === value}
            className="group relative flex-1 py-3.5 text-[0.9375rem] font-semibold transition hover:bg-sunken">
            <span className={tab === value ? '' : 'text-muted'}>{label}</span>
            {tab === value && (
              <span className="absolute inset-x-0 bottom-0 mx-auto h-[3px] w-14 rounded-full bg-primary-600" />
            )}
          </button>
        ))}
      </div>

      <Composer onPosted={(post) => feed.setItems((prev) => [post, ...prev])} />

      <FeedList
        feed={feed}
        onReply={(post) => navigate(`/post/${post.id}`)}
        empty={
          tab === 'following' ? (
            <EmptyState
              title="Your timeline is quiet"
              description="Follow a few people and their posts land here. For you is a good place to start."
              action={
                <button type="button" className="btn-primary" onClick={() => setTab('explore')}>
                  Browse For you
                </button>
              }
            />
          ) : (
            <EmptyState
              title="Nothing to show yet"
              description="Be the first to post something."
            />
          )
        }
      />
    </>
  );
};

export default HomePage;
