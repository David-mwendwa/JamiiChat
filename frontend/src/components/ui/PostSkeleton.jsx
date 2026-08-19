// Skeletons rather than a spinner: the shape of a feed is known before its
// content is, so the page can hold its layout while the data arrives.
const PostSkeleton = ({ count = 4 }) => (
  <div aria-hidden="true">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="divider flex gap-3 px-4 py-4">
        <div className="skeleton h-11 w-11 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2.5 pt-1">
          <div className="skeleton h-3 w-40" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-4/5" />
        </div>
      </div>
    ))}
  </div>
);

export default PostSkeleton;
