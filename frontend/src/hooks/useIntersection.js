import { useEffect, useRef } from 'react';

// Fires when the sentinel scrolls into view. rootMargin starts the next page
// before the reader reaches the bottom, so the feed rarely shows a gap.
const useIntersection = (onIntersect, { rootMargin = '600px' } = {}) => {
  const ref = useRef(null);
  const handler = useRef(onIntersect);
  handler.current = onIntersect;

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) handler.current();
      },
      { rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin]);

  return ref;
};

export default useIntersection;
