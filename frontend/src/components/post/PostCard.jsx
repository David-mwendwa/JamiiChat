import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Avatar from '../ui/Avatar.jsx';
import Icon from '../ui/Icon.jsx';
import RichText from './RichText.jsx';
import PostMedia from './PostMedia.jsx';
import PostActions from './PostActions.jsx';
import PostMenu from './PostMenu.jsx';
import cn from '../../lib/cn.js';
import { relativeTime } from '../../lib/format.js';
import { useAuth } from '../../context/AuthProvider.jsx';

const QuotedPost = ({ post }) => (
  <Link
    to={`/post/${post.id}`}
    onClick={(e) => e.stopPropagation()}
    className="mt-3 block rounded-2xl border border-line p-3 transition hover:bg-sunken dark:border-line hover:bg-sunken/50">
    <div className="flex items-center gap-2">
      <Avatar user={post.author} size="xs" link={false} />
      <span className="text-[0.8125rem] font-semibold">{post.author?.displayName}</span>
      <span className="handle">@{post.author?.handle}</span>
      <span className="handle">· {relativeTime(post.createdAt)}</span>
    </div>
    <p className="post-text mt-1.5 line-clamp-4">{post.text}</p>
  </Link>
);

// Works controlled or uncontrolled. A list that owns its posts passes onChange
// and stays the source of truth; a one-off render (a search result, a thread
// ancestor) passes nothing and the card tracks its own like state rather than
// calling an onChange that is not there.
const PostCard = ({ post, onChange, onDelete, onReply, emphasis = false }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [local, setLocal] = useState(post);

  useEffect(() => setLocal(post), [post]);

  const shown = local;
  if (!shown) return null;

  // A plain repost renders as the original post with a byline above it, which
  // is what the reader is actually being shown.
  const isPlainRepost = shown.kind === 'repost' && shown.repostOf;
  const body = isPlainRepost ? shown.repostOf : shown;

  // The action bar acts on the post being displayed — for a repost that is the
  // inner post, so the change has to be merged back into the wrapper rather
  // than replacing it and losing the "X reposted" byline.
  const update = (next) => {
    const merged = isPlainRepost ? { ...shown, repostOf: next } : next;
    setLocal(merged);
    onChange?.(merged);
  };

  const author = body.author;

  if (!author) return null;

  // The whole card is clickable, but only where a nested link is not. Nested
  // handlers call stopPropagation so a tap on a mention does not also open the
  // post underneath it.
  const openPost = (event) => {
    if (event.target.closest('a,button')) return;
    navigate(`/post/${body.id}`);
  };

  return (
    <article
      onClick={openPost}
      className={cn(
        'divider cursor-pointer px-4 py-3 transition hover:bg-sunken/60',
        emphasis && 'cursor-default hover:bg-transparent dark:hover:bg-transparent'
      )}>
      {isPlainRepost && (
        <p className="mb-1.5 flex items-center gap-1.5 pl-[3.4rem] text-[0.8125rem] font-medium text-muted">
          <Icon name="repost" className="h-3.5 w-3.5" />
          <Link to={`/${shown.author.handle}`} className="hover:underline">
            {shown.author.id === user?.id ? 'You' : shown.author.displayName} reposted
          </Link>
        </p>
      )}

      <div className="flex gap-3">
        <Avatar user={author} size="md" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link
              to={`/${author.handle}`}
              onClick={(e) => e.stopPropagation()}
              className="truncate text-[0.9375rem] font-bold text-ink hover:underline">
              {author.displayName}
            </Link>
            <span className="handle truncate">@{author.handle}</span>
            <span className="handle">·</span>
            <time className="handle shrink-0" dateTime={body.createdAt} title={body.createdAt}>
              {relativeTime(body.createdAt)}
            </time>

            <div className="ml-auto shrink-0">
              <PostMenu post={body} onDelete={onDelete} />
            </div>
          </div>

          {body.text && <RichText text={body.text} />}
          <PostMedia media={body.media} />
          {shown.kind === 'quote' && shown.repostOf && <QuotedPost post={shown.repostOf} />}

          <PostActions post={body} onChange={update} onReply={onReply} />
        </div>
      </div>
    </article>
  );
};

export default PostCard;
