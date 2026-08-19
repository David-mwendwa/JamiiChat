import PostCard from '../post/PostCard.jsx';
import PostSkeleton from '../ui/PostSkeleton.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Spinner from '../ui/Spinner.jsx';
import useIntersection from '../../hooks/useIntersection.js';

// The shared body of every timeline in the app. Takes the state a
// useInfiniteFeed returns and renders it, so home, profile, tag, bookmarks and
// search results all behave identically when they load, fail or run out.
const FeedList = ({
  feed,
  empty,
  onReply,
  emphasisFirst = false,
}) => {
  const { items, setItems, loading, loadingMore, error, done, loadMore } = feed;
  const sentinel = useIntersection(loadMore);

  if (loading) return <PostSkeleton />;

  if (error)
    return (
      <EmptyState
        title="That did not load"
        description="The connection dropped or the server is waking up. Try again."
        action={
          <button type="button" className="btn-outline" onClick={feed.refresh}>
            Try again
          </button>
        }
      />
    );

  if (items.length === 0) return empty ?? <EmptyState title="Nothing here yet" />;

  const replace = (next) =>
    setItems((prev) => prev.map((p) => (p.id === next.id ? next : p)));

  const remove = (id) =>
    setItems((prev) => prev.filter((p) => p.id !== id && p.repostOf?.id !== id));

  return (
    <>
      {items.map((post, index) => (
        <PostCard
          key={post.id}
          post={post}
          onChange={replace}
          onDelete={remove}
          onReply={onReply}
          emphasis={emphasisFirst && index === 0}
        />
      ))}

      <div ref={sentinel} className="flex justify-center py-8">
        {loadingMore && <Spinner label="Loading more posts" />}
        {done && items.length > 6 && (
          <p className="text-sm text-muted">That is everything for now.</p>
        )}
      </div>
    </>
  );
};

export default FeedList;
