import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader.jsx';
import PostCard from '../components/post/PostCard.jsx';
import Composer from '../components/post/Composer.jsx';
import FeedList from '../components/feed/FeedList.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import PostSkeleton from '../components/ui/PostSkeleton.jsx';
import useInfiniteFeed from '../hooks/useInfiniteFeed.js';
import { postApi } from '../api/index.js';
import { useAuth } from '../context/AuthProvider.jsx';
import usePageMeta from '../lib/pageMeta.js';

const PostPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState(null);
  const [ancestors, setAncestors] = useState([]);
  const [status, setStatus] = useState('loading');

  /*
   * A post's own text is its description, trimmed to what an unfurl shows.
   *
   * A thread URL is the single most-pasted kind of link this app produces, and
   * every one of them previewed as the site homepage. Truncation is at 160
   * characters because that is roughly where search results and link previews
   * cut, and a description cut mid-word by someone else's renderer reads worse
   * than one cut deliberately.
   */
  const author = post?.author;
  usePageMeta(
    author ? `${author.displayName} on JamiiChat` : 'Post',
    post?.text ? `${post.text.slice(0, 157)}${post.text.length > 157 ? '…' : ''}` : undefined
  );

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    postApi
      .get(id)
      .then(({ data }) => {
        if (cancelled) return;
        setPost(data.post);
        setAncestors(data.ancestors ?? []);
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('missing'));

    return () => {
      cancelled = true;
    };
  }, [id]);

  const fetcher = useCallback(
    async (cursor) => {
      const { data } = await postApi.replies(id, { cursor, limit: 20 });
      return { items: data.items, nextCursor: data.nextCursor };
    },
    [id]
  );

  const feed = useInfiniteFeed(fetcher, [id], `feed:replies:${id}`);

  if (status === 'loading')
    return (
      <>
        <PageHeader title="Post" back />
        <PostSkeleton count={3} />
      </>
    );

  if (status === 'missing')
    return (
      <>
        <PageHeader title="Post" back />
        <EmptyState
          title="This post is not available"
          description="It may have been deleted, or it belongs to an account you cannot see."
          action={
            <button type="button" className="btn-primary" onClick={() => navigate('/')}>
              Back home
            </button>
          }
        />
      </>
    );

  return (
    <>
      <PageHeader title="Post" back />

      {/* The conversation this reply sits in, so a permalink is never a
          fragment without context. */}
      {ancestors.map((parent) => (
        <PostCard key={parent.id} post={parent} onReply={() => {}} />
      ))}

      <PostCard
        post={post}
        onChange={setPost}
        onDelete={() => navigate('/')}
        emphasis
      />

      {user && (
        <Composer
          replyTo={post.id}
          placeholder={`Reply to @${post.author.handle}`}
          onPosted={(reply) => {
            feed.setItems((prev) => [...prev, reply]);
            setPost((p) => ({ ...p, counts: { ...p.counts, replies: p.counts.replies + 1 } }));
          }}
        />
      )}

      <FeedList
        feed={feed}
        onReply={(reply) => navigate(`/post/${reply.id}`)}
        empty={
          <EmptyState
            title="No replies yet"
            description={user ? 'Be the first to say something.' : 'Sign in to join the conversation.'}
          />
        }
      />
    </>
  );
};

export default PostPage;
