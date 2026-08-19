import useClickOutside from '../../hooks/useClickOutside.js';

// A curated set rather than a full Unicode sweep — the same handful of
// reactions cover almost everything anyone actually reaches for here, and a
// short list stays scannable without a search box.
const GROUPS = [
  {
    label: 'Smileys',
    emojis: ['😀', '😁', '😂', '🤣', '😊', '🙂', '😉', '😍', '😘', '😜', '🤔', '😎', '🙄', '😴', '😭', '😡'],
  },
  {
    label: 'Gestures',
    emojis: ['👍', '👎', '👏', '🙌', '🙏', '👋', '💪', '✌️', '🤝', '🤞', '👌', '🤙'],
  },
  {
    label: 'Hearts',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💯'],
  },
  {
    label: 'Other',
    emojis: ['🔥', '✨', '🎉', '🚀', '⭐', '☀️', '🌙', '☕', '🎶', '👀', '💀', '🐛'],
  },
];

// A small floating grid, positioned by the caller (it just fills its parent's
// nearest `relative` ancestor). Closes on an outside click or Escape via the
// same hook every other popover in the app uses.
const EmojiPicker = ({ onPick, onClose, className }) => {
  const ref = useClickOutside(onClose);

  return (
    <div
      ref={ref}
      className={
        className ??
        // Positioned relative to the VIEWPORT, not the trigger. The trigger
        // sits mid-row in both composers, so anchoring the panel to either of
        // its edges pushed it off one side or the other of a phone screen —
        // `fixed` + centred + width-clamped keeps it on screen at any width,
        // and it still rides just above the composer via `bottom`.
        'surface fixed bottom-24 left-1/2 z-40 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 animate-slide-up rounded-2xl border shadow-lift sm:absolute sm:bottom-full sm:left-auto sm:right-0 sm:mb-2 sm:translate-x-0'
      }>
      <div className="max-h-64 overflow-y-auto p-3">
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-3 last:mb-0">
            <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
              {group.label}
            </p>
            <div className="grid grid-cols-8 gap-0.5">
              {group.emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onPick(emoji)}
                  className="rounded-lg p-1 text-xl leading-none transition hover:bg-sunken">
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EmojiPicker;
