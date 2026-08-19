import { useCallback, useEffect, useRef, useState } from 'react';

// Every list in the app re-fetches from scratch on mount, which is right the
// first time a screen is visited but means clicking Home -> Explore -> Home
// re-shows the loading skeleton for a feed you were just looking at a moment
// ago. This in-memory cache lets a revisit paint instantly from what was last
// seen while a fresh copy loads silently behind it — a cheap
// stale-while-revalidate, not a real data layer. It only ever holds the most
// recent page for a given key, and it is intentionally wiped on any auth
// change (see `clearFeedCache`) so switching accounts never flashes the
// previous account's feed.
const cache = new Map();

export const clearFeedCache = () => cache.clear();

// Drives every paginated list in the app. The fetcher is handed the current
// cursor and returns { items, nextCursor } — the same shape every list endpoint
// returns, so home, replies, bookmarks and search all share this hook.
//
// `cacheKey`, when given, must uniquely identify this list (route + any params
// that change what it fetches, e.g. `feed:home:following` or `profile:${handle}:posts`).
// Omit it for lists that should always fetch fresh (none currently do).
const useInfiniteFeed = (fetcher, deps = [], cacheKey = null) => {
  const cached = cacheKey ? cache.get(cacheKey) : null;

  const [items, setItems] = useState(cached?.items ?? []);
  const [cursor, setCursor] = useState(cached?.cursor ?? null);
  const [loading, setLoading] = useState(!cached);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(cached?.done ?? false);

  // Guards against a second page request landing while the first is in flight,
  // which an intersection observer will happily trigger on a fast scroll.
  const inFlight = useRef(false);
  const generation = useRef(0);
  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;

  const load = useCallback(
    async (nextCursor = null, replace = false, silent = false) => {
      if (inFlight.current) return;
      inFlight.current = true;
      const run = generation.current;

      if (replace && !silent) setLoading(true);
      else if (!replace) setLoadingMore(true);

      try {
        const result = await fetcher(nextCursor);
        // A response from a superseded query (the tab changed mid-request) must
        // not overwrite the current list.
        if (run !== generation.current) return;

        setItems((prev) => (replace ? result.items : [...prev, ...result.items]));
        setCursor(result.nextCursor ?? null);
        setDone(!result.nextCursor);
        setError(null);

        if (replace && cacheKeyRef.current) {
          cache.set(cacheKeyRef.current, {
            items: result.items,
            cursor: result.nextCursor ?? null,
            done: !result.nextCursor,
          });
        }
      } catch (err) {
        // A silent background refresh must not blow away a still-good cached
        // list with an error screen — the visible content stays, it just did
        // not get any fresher this time.
        if (run === generation.current && !silent) setError(err);
      } finally {
        if (run === generation.current) {
          setLoading(false);
          setLoadingMore(false);
        }
        inFlight.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps
  );

  useEffect(() => {
    generation.current += 1;
    inFlight.current = false;
    const hit = cacheKey ? cache.get(cacheKey) : null;

    if (hit) {
      setItems(hit.items);
      setCursor(hit.cursor);
      setDone(hit.done);
      setError(null);
      setLoading(false);
      load(null, true, true);
    } else {
      setItems([]);
      setCursor(null);
      setDone(false);
      load(null, true, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const loadMore = useCallback(() => {
    if (done || loading || loadingMore || !cursor) return;
    load(cursor, false);
  }, [done, loading, loadingMore, cursor, load]);

  const refresh = useCallback(() => {
    generation.current += 1;
    inFlight.current = false;
    load(null, true);
  }, [load]);

  return {
    items,
    setItems,
    loading,
    loadingMore,
    error,
    done,
    loadMore,
    refresh,
  };
};

export default useInfiniteFeed;
