import { useEffect, useRef } from 'react';

const useClickOutside = (onOutside) => {
  const ref = useRef(null);
  const handler = useRef(onOutside);
  handler.current = onOutside;

  useEffect(() => {
    const listener = (event) => {
      if (ref.current && !ref.current.contains(event.target)) handler.current();
    };
    const onEscape = (event) => {
      if (event.key === 'Escape') handler.current();
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  return ref;
};

export default useClickOutside;
