import { useRef, useState } from 'react';
import Avatar from '../ui/Avatar.jsx';
import Icon from '../ui/Icon.jsx';
import EmojiPicker from '../ui/EmojiPicker.jsx';
import cn from '../../lib/cn.js';
import { postApi } from '../../api/index.js';
import { errorMessage } from '../../api/apiClient.js';
import { useAuth } from '../../context/AuthProvider.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { insertAtCursor } from '../../lib/insertAtCursor.js';

const LIMIT = 500;
const MAX_IMAGES = 4;

const Composer = ({ replyTo = null, onPosted, autoFocus = false, placeholder }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  // Collapsed until it is used. An empty composer that reserves the full
  // compose height is dead space at the top of every visit to the feed.
  const [expanded, setExpanded] = useState(autoFocus || Boolean(replyTo));
  const [emojiOpen, setEmojiOpen] = useState(false);
  const fileInput = useRef(null);
  const textarea = useRef(null);

  const pickEmoji = (emoji) => {
    const { next, cursor } = insertAtCursor(textarea.current, text, emoji);
    setText(next);
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(cursor, cursor);
    });
  };

  const remaining = LIMIT - text.length;
  const canPost = (text.trim().length > 0 || files.length > 0) && remaining >= 0 && !busy;

  // Grows with the content rather than scrolling inside a fixed box — a post is
  // short, and seeing all of it while writing matters more than a stable height.
  const autoGrow = (event) => {
    const el = event.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 400)}px`;
    setText(el.value);
  };

  const addFiles = (list) => {
    const picked = Array.from(list)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, MAX_IMAGES - files.length);

    if (picked.length === 0) return;
    setFiles((prev) => [
      ...prev,
      ...picked.map((file) => ({ file, preview: URL.createObjectURL(file) })),
    ]);
  };

  const removeFile = (index) => {
    setFiles((prev) => {
      // The object URL is released explicitly; leaving it allocated leaks the
      // whole image for the lifetime of the page.
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const submit = async (event) => {
    event?.preventDefault();
    if (!canPost) return;

    setBusy(true);
    const form = new FormData();
    form.append('text', text.trim());
    if (replyTo) form.append('replyTo', replyTo);
    for (const item of files) form.append('images', item.file);

    try {
      const { data } = await postApi.create(form);
      for (const item of files) URL.revokeObjectURL(item.preview);
      setText('');
      setFiles([]);
      if (textarea.current) textarea.current.style.height = 'auto';
      if (!replyTo && !autoFocus) setExpanded(false);
      onPosted?.(data.post);
    } catch (err) {
      toast.error(errorMessage(err, 'Your post did not go through'));
    } finally {
      setBusy(false);
    }
  };

  // Cmd/Ctrl+Enter posts, which is the shortcut people already expect here.
  const onKeyDown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit();
  };

  if (!user) return null;

  const ratio = Math.min(text.length / LIMIT, 1);

  return (
    <form onSubmit={submit} className="divider flex gap-3 px-4 py-3.5">
      <Avatar user={user} size="md" link={false} />

      <div className="min-w-0 flex-1">
        <textarea
          ref={textarea}
          value={text}
          onChange={autoGrow}
          onKeyDown={onKeyDown}
          onPaste={(e) => e.clipboardData.files.length && addFiles(e.clipboardData.files)}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus}
          rows={1}
          onFocus={() => setExpanded(true)}
          placeholder={placeholder ?? (replyTo ? 'Write your reply' : "What's happening?")}
          aria-label={replyTo ? 'Write your reply' : 'Write a post'}
          className={cn(
            'w-full resize-none border-0 bg-transparent p-0 text-base leading-snug placeholder:text-muted focus:ring-0 sm:text-lg',
            expanded ? 'min-h-[3.25rem]' : 'min-h-[2.25rem]'
          )}
        />

        {files.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {files.map((item, i) => (
              <div key={item.preview} className="relative">
                <img
                  src={item.preview}
                  alt=""
                  className="h-32 w-full rounded-xl object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  aria-label="Remove image"
                  className="absolute right-1.5 top-1.5 rounded-full bg-ink/70 p-1 text-white transition hover:bg-ink">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          className={cn(
            'flex items-center justify-between transition-all',
            expanded ? 'mt-2 h-10 opacity-100' : 'h-0 overflow-hidden opacity-0'
          )}>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={files.length >= MAX_IMAGES}
            aria-label="Add an image"
            className="rounded-full p-2 text-primary-600 transition hover:bg-primary-50 disabled:opacity-40 dark:text-primary-400 dark:hover:bg-primary-950/40">
            <Icon name="image" className="h-5 w-5" />
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />

          <div className="relative -ml-auto mr-auto">
            <button
              type="button"
              onClick={() => setEmojiOpen((v) => !v)}
              aria-label="Add an emoji"
              aria-expanded={emojiOpen}
              className="rounded-full p-2 text-lg leading-none transition hover:bg-sunken">
              🙂
            </button>
            {emojiOpen && <EmojiPicker onPick={pickEmoji} onClose={() => setEmojiOpen(false)} />}
          </div>

          <div className="flex items-center gap-3">
            {text.length > 0 && (
              <div className="flex items-center gap-2">
                {/* The ring fills as the limit approaches; the number only
                    appears once it is close enough to matter. */}
                <svg viewBox="0 0 32 32" className="h-6 w-6 -rotate-90" aria-hidden="true">
                  <circle cx="16" cy="16" r="13" fill="none" strokeWidth="3" className="stroke-line" />
                  <circle
                    cx="16"
                    cy="16"
                    r="13"
                    fill="none"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 13}
                    strokeDashoffset={2 * Math.PI * 13 * (1 - ratio)}
                    className={cn(
                      'transition-all',
                      remaining < 0
                        ? 'stroke-rose-500'
                        : remaining <= 40
                          ? 'stroke-secondary-500'
                          : 'stroke-primary-500'
                    )}
                  />
                </svg>
                {remaining <= 40 && (
                  <span
                    className={cn(
                      'metric text-xs font-semibold',
                      remaining < 0 ? 'text-rose-600' : 'text-muted'
                    )}>
                    {remaining}
                  </span>
                )}
              </div>
            )}

            <button type="submit" disabled={!canPost} className="btn-primary px-5">
              {busy ? 'Posting…' : replyTo ? 'Reply' : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
};

export default Composer;
