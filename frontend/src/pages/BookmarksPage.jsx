import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader.jsx';
import FeedList from '../components/feed/FeedList.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import useInfiniteFeed from '../hooks/useInfiniteFeed.js';
import { postApi } from '../api/index.js';

const BookmarksPage = () => {
  const navigate = useNavigate();

  const fetcher = useCallback(async (cursor) => {
    const { data } = await postApi.bookmarks({ cursor, limit: 20 });
    return { items: data.items, nextCursor: data.nextCursor };
  }, []);

  const feed = useInfiniteFeed(fetcher, [], 'feed:bookmarks');

  return (
    <>
      <PageHeader title="Saved" subtitle="Only you can see these" />
      <FeedList
        feed={feed}
        onReply={(post) => navigate(`/post/${post.id}`)}
        empty={
          <EmptyState
            title="Nothing saved yet"
            description="Tap the bookmark icon under any post to keep it here."
          />
        }
      />
    </>
  );
};

export default BookmarksPage;
