import { useState } from 'react';
import Icon from '../ui/Icon.jsx';
import cn from '../../lib/cn.js';
import { compactCount } from '../../lib/format.js';
import { postApi } from '../../api/index.js';
import { errorMessage } from '../../api/apiClient.js';
import { useAuthGate } from '../../context/AuthGateProvider.jsx';
import { useToast } from '../../context/ToastProvider.jsx';

// Tone per action. The hit target is the whole pill, but only the icon gets the
// tinted circle on hover — a full-width highlight under four adjacent controls
// reads as noise.
const TONES = {
  reply: 'hover:text-primary-600 group-hover:bg-primary-500/10 dark:hover:text-primary-400',
  repost: 'hover:text-emerald-600 group-hover:bg-emerald-500/10 dark:hover:text-emerald-400',
  like: 'hover:text-rose-600 group-hover:bg-rose-500/10 dark:hover:text-rose-400',
  bookmark: 'hover:text-primary-600 group-hover:bg-primary-500/10 dark:hover:text-primary-400',
};

const ACTIVE = {
  reply: 'text-primary-600 dark:text-primary-400',
  repost: 'text-emerald-600 dark:text-emerald-400',
  like: 'text-rose-600 dark:text-rose-400',
  bookmark: 'text-primary-600 dark:text-primary-400',
};

const Action = ({ icon, count, active, tone, label, onClick, filled }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    title={label}
    className={cn(
      'group -ml-1.5 inline-flex items-center gap-1 rounded-full py-1 pr-2 text-[0.8125rem] font-medium transition',
      active ? ACTIVE[tone] : 'text-muted',
      TONES[tone]
    )}>
    <span className={cn('rounded-full p-1.5 transition', active && filled && 'animate-pop')}>
      <Icon name={icon} className="h-[17px] w-[17px]" filled={active && filled} strokeWidth={1.9} />
    </span>
    {/* The slot is reserved even at zero, so icons stay on a fixed grid and do
        not shuffle sideways the moment a post gets its first like. */}
    <span className="metric min-w-[1ch] text-left">{count > 0 ? compactCount(count) : ''}</span>
  </button>
);

const PostActions = ({ post, onChange, onReply }) => {
  const { requireAuth } = useAuthGate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // Optimistic: the icon responds on the tap and rolls back if the request
  // fails. A like that waits for a round trip feels broken on a slow network.
  const toggleLike = () =>
    requireAuth(async () => {
      if (busy) return;
      const wasLiked = post.likedByViewer;
      setBusy(true);
      onChange({
        ...post,
        likedByViewer: !wasLiked,
        counts: { ...post.counts, likes: post.counts.likes + (wasLiked ? -1 : 1) },
      });

      try {
        const { data } = wasLiked ? await postApi.unlike(post.id) : await postApi.like(post.id);
        onChange({
          ...post,
          likedByViewer: data.liked,
          counts: { ...post.counts, likes: data.likes },
        });
      } catch (err) {
        onChange(post);
        toast.error(errorMessage(err, 'That like did not go through'));
      } finally {
        setBusy(false);
      }
    });

  const toggleRepost = () =>
    requireAuth(async () => {
      if (busy) return;
      setBusy(true);
      try {
        const { data } = await postApi.repost(post.id, '');
        onChange({
          ...post,
          counts: { ...post.counts, reposts: post.counts.reposts + (data.post ? 1 : 0) },
        });
        toast.success('Reposted');
      } catch (err) {
        toast.error(errorMessage(err, 'Could not repost'));
      } finally {
        setBusy(false);
      }
    });

  const toggleBookmark = () =>
    requireAuth(async () => {
      if (busy) return;
      const wasSaved = post.bookmarkedByViewer;
      setBusy(true);
      onChange({ ...post, bookmarkedByViewer: !wasSaved });

      try {
        if (wasSaved) await postApi.unbookmark(post.id);
        else await postApi.bookmark(post.id);
        toast.success(wasSaved ? 'Removed from saved' : 'Saved');
      } catch (err) {
        onChange(post);
        toast.error(errorMessage(err, 'Could not save that post'));
      } finally {
        setBusy(false);
      }
    });

  return (
    // Capped well short of the card edge: at full width the bookmark drifts so
    // far from the text that it stops reading as part of the same post.
    <div className="-mb-1 mt-1.5 flex max-w-[19rem] items-center justify-between">
      <Action
        icon="reply"
        count={post.counts.replies}
        tone="reply"
        label="Reply"
        onClick={() => requireAuth(() => onReply?.(post))}
      />
      <Action
        icon="repost"
        count={post.counts.reposts}
        tone="repost"
        label="Repost"
        onClick={toggleRepost}
      />
      <Action
        icon="heart"
        count={post.counts.likes}
        active={post.likedByViewer}
        filled
        tone="like"
        label={post.likedByViewer ? 'Unlike' : 'Like'}
        onClick={toggleLike}
      />
      <Action
        icon="bookmark"
        active={post.bookmarkedByViewer}
        filled
        tone="bookmark"
        label={post.bookmarkedByViewer ? 'Remove from saved' : 'Save'}
        onClick={toggleBookmark}
      />
    </div>
  );
};

export default PostActions;
