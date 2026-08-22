import { useState } from 'react';
import Icon from '../ui/Icon.jsx';
import Modal from '../ui/Modal.jsx';
import Avatar from '../ui/Avatar.jsx';
import cn from '../../lib/cn.js';
import { compactCount } from '../../lib/format.js';
import { postApi } from '../../api/index.js';
import { errorMessage } from '../../api/apiClient.js';
import { useAuthGate } from '../../context/AuthGateProvider.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import useClickOutside from '../../hooks/useClickOutside.js';

const QUOTE_LIMIT = 500;

// The compose surface for "Quote" — a caption on top of the original post,
// distinct from a plain repost which carries no text of its own.
const QuoteModal = ({ post, open, onClose, onQuoted }) => {
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const remaining = QUOTE_LIMIT - text.length;
  const canSend = text.trim().length > 0 && remaining >= 0 && !busy;

  const close = () => {
    setText('');
    onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canSend) return;
    setBusy(true);
    try {
      const { data } = await postApi.repost(post.id, text.trim());
      toast.success('Quoted');
      setText('');
      onClose();
      onQuoted?.(data.post);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not send that quote'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Quote post">
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Add a caption"
          aria-label="Add a caption"
          className="w-full resize-none rounded-xl border border-line bg-transparent p-3 text-[0.9375rem] placeholder:text-muted focus:border-primary-500 focus:outline-none focus:ring-0"
        />

        <div className="mt-3 rounded-2xl border border-line p-3">
          <div className="flex items-center gap-2">
            <Avatar user={post.author} size="xs" link={false} />
            <span className="text-[0.8125rem] font-semibold">{post.author?.displayName}</span>
            <span className="handle">@{post.author?.handle}</span>
          </div>
          {post.text && <p className="post-text mt-1.5 line-clamp-4">{post.text}</p>}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className={cn('metric text-xs font-semibold', remaining < 0 ? 'text-rose-600' : 'text-muted')}>
            {remaining < 40 ? remaining : ''}
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!canSend}>
              {busy ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};

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

  const [repostMenuOpen, setRepostMenuOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const repostMenuRef = useClickOutside(() => setRepostMenuOpen(false));

  const doRepost = async () => {
    if (busy) return;
    setRepostMenuOpen(false);
    setBusy(true);
    const wasReposted = post.repostedByViewer;
    onChange({
      ...post,
      repostedByViewer: !wasReposted,
      counts: { ...post.counts, reposts: post.counts.reposts + (wasReposted ? -1 : 1) },
    });

    try {
      if (wasReposted) {
        await postApi.undoRepost(post.id);
        toast.success('Repost removed');
      } else {
        await postApi.repost(post.id, '');
        toast.success('Reposted');
      }
    } catch (err) {
      onChange(post);
      toast.error(errorMessage(err, wasReposted ? 'Could not undo that repost' : 'Could not repost'));
    } finally {
      setBusy(false);
    }
  };

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
      <div ref={repostMenuRef} className="relative">
        <Action
          icon="repost"
          count={post.counts.reposts}
          active={post.repostedByViewer}
          tone="repost"
          label={post.repostedByViewer ? 'Reposted' : 'Repost'}
          onClick={() => requireAuth(() => setRepostMenuOpen((v) => !v))}
        />

        {repostMenuOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="surface absolute left-0 top-9 z-20 w-44 animate-slide-down overflow-hidden rounded-xl border shadow-lift">
            <button
              type="button"
              onClick={doRepost}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium transition hover:bg-sunken">
              <Icon name="repost" className="h-4 w-4" />
              {post.repostedByViewer ? 'Undo repost' : 'Repost'}
            </button>
            <button
              type="button"
              onClick={() => {
                setRepostMenuOpen(false);
                setQuoteOpen(true);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium transition hover:bg-sunken">
              <Icon name="feather" className="h-4 w-4" />
              Quote
            </button>
          </div>
        )}
      </div>

      <QuoteModal
        post={post}
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        onQuoted={() => onChange({ ...post, counts: { ...post.counts, reposts: post.counts.reposts + 1 } })}
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
