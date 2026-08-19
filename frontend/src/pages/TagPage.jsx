import { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader.jsx';
import FeedList from '../components/feed/FeedList.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import useInfiniteFeed from '../hooks/useInfiniteFeed.js';
import { feedApi } from '../api/index.js';

const TagPage = () => {
  const { tag } = useParams();
  const navigate = useNavigate();

  const fetcher = useCallback(
    async (cursor) => {
      const { data } = await feedApi.tag(tag, { cursor, limit: 20 });
      return { items: data.items, nextCursor: data.nextCursor };
    },
    [tag]
  );

  const feed = useInfiniteFeed(fetcher, [tag], `feed:tag:${tag}`);

  return (
    <>
      <PageHeader title={`#${tag}`} back />
      <FeedList
        feed={feed}
        onReply={(post) => navigate(`/post/${post.id}`)}
        empty={
          <EmptyState
            title={`Nobody has posted #${tag} yet`}
            description="Use the tag in a post and it will show up here."
          />
        }
      />
    </>
  );
};

export default TagPage;
