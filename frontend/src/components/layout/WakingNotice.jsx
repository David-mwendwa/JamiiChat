import { useEffect, useState } from 'react';
import { API_SLOW_EVENT, API_AWAKE_EVENT } from '../../api/apiClient.js';

/*
 * Says out loud when the API is taking a long time to answer.
 *
 * The API sleeps on its free hosting tier, and the first request after that
 * waits out a full cold start — 23.1s measured, against 0.59s warm. Until this
 * existed the whole app was held behind a spinner for those 23 seconds with no
 * explanation, which reads as broken rather than slow.
 *
 * Two things changed together and only make sense together: AuthProvider now
 * paints the cached session immediately instead of waiting, so screens fill in
 * around a request that is still running, and this says why the content has
 * not arrived. Neither alone is enough — silence beside empty screens is just
 * a different way to look broken.
 *
 * Deliberately not a blocking overlay. Everything already rendered stays
 * usable, and the notice takes itself down as soon as the API answers.
 */
const WakingNotice = () => {
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    const onSlow = () => setWaking(true);
    const onAwake = () => setWaking(false);
    window.addEventListener(API_SLOW_EVENT, onSlow);
    window.addEventListener(API_AWAKE_EVENT, onAwake);
    return () => {
      window.removeEventListener(API_SLOW_EVENT, onSlow);
      window.removeEventListener(API_AWAKE_EVENT, onAwake);
    };
  }, []);

  if (!waking) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      <p
        role="status"
        // Amber, matching ConnectionStatus: in this app the one saturated
        // colour always means "something is happening to the connection".
        className="flex items-center gap-2 rounded-full border border-secondary-200 bg-secondary-50 px-3.5 py-1.5 text-xs font-medium text-secondary-800 shadow-sm dark:border-secondary-900 dark:bg-secondary-950/90 dark:text-secondary-300">
        <span className="h-2 w-2 animate-pulse rounded-full bg-secondary-500" />
        Waking the server — this takes a few seconds on the free tier
      </p>
    </div>
  );
};

export default WakingNotice;
