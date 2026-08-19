import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import cn from '../lib/cn.js';

const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
};

let nextId = 0;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, tone = 'info') => {
      const id = (nextId += 1);
      setToasts((prev) => [...prev, { id, message, tone }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      toast: push,
      success: (message) => push(message, 'success'),
      error: (message) => push(message, 'error'),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-20 left-1/2 z-50 flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2 sm:bottom-6"
        role="status"
        aria-live="polite">
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            className={cn(
              'pointer-events-auto animate-slide-down rounded-xl px-4 py-3 text-left text-sm font-medium text-white shadow-lift',
              t.tone === 'success' && 'bg-emerald-600',
              t.tone === 'error' && 'bg-rose-600',
              t.tone === 'info' && 'bg-ink'
            )}>
            {t.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastProvider;
