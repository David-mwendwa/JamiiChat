import { useState } from 'react';
import cn from '../../lib/cn.js';
import { userApi } from '../../api/index.js';
import { errorMessage } from '../../api/apiClient.js';
import { useAuthGate } from '../../context/AuthGateProvider.jsx';
import { useToast } from '../../context/ToastProvider.jsx';

const LABELS = {
  none: 'Follow',
  following: 'Following',
  requested: 'Requested',
};

const FollowButton = ({ handle, initialState = 'none', size = 'md', onChange }) => {
  const { requireAuth } = useAuthGate();
  const toast = useToast();
  const [state, setState] = useState(initialState);
  const [hovering, setHovering] = useState(false);
  const [busy, setBusy] = useState(false);

  if (state === 'self') return null;

  const toggle = () =>
    requireAuth(async () => {
      if (busy) return;

      setBusy(true);
      const previous = state;
      const next = state === 'none' ? 'following' : 'none';
      setState(next);

      try {
        const { data } =
          previous === 'none' ? await userApi.follow(handle) : await userApi.unfollow(handle);
        setState(data.relationship);
        onChange?.(data.relationship);
      } catch (err) {
        setState(previous);
        toast.error(errorMessage(err, 'That did not work'));
      } finally {
        setBusy(false);
      }
    });

  const isFollowing = state === 'following' || state === 'requested';
  // A "Following" button that says "Unfollow" on hover is the only way the
  // control tells you what pressing it will actually do.
  const label = isFollowing && hovering ? 'Unfollow' : LABELS[state];

  return (
    <button
      type="button"
      onClick={toggle}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      disabled={busy}
      className={cn(
        'btn shrink-0 font-bold',
        size === 'sm' ? 'px-4 py-1.5 text-[0.8125rem]' : 'px-5 py-2',
        isFollowing
          ? hovering
            ? 'border border-rose-300 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400'
            : 'border border-line-strong text-ink hover:bg-sunken'
          : 'bg-ink text-canvas hover:opacity-90'
      )}>
      {label}
    </button>
  );
};

export default FollowButton;
