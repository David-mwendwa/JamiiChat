import { useEffect } from 'react';
import useClickOutside from '../../hooks/useClickOutside.js';

const Modal = ({ open, onClose, title, children, size = 'md' }) => {
  const ref = useClickOutside(onClose);

  // The page behind a modal must not scroll, or dismissing it returns the
  // reader somewhere they did not choose.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[10vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}>
      <div
        ref={ref}
        className={`surface w-full ${size === 'lg' ? 'max-w-2xl' : 'max-w-lg'} animate-slide-down rounded-2xl border shadow-lift`}>
        <div className="divider flex items-center justify-between px-5 py-3.5">
          <h2 className="text-base">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted transition hover:bg-sunken"
            aria-label="Close">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
