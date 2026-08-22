import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Avatar from '../components/ui/Avatar.jsx';
import Icon from '../components/ui/Icon.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import EmojiPicker from '../components/ui/EmojiPicker.jsx';
import Modal from '../components/ui/Modal.jsx';
import cn from '../lib/cn.js';
import { relativeTime, fullDate, mediaUrl } from '../lib/format.js';
import { insertAtCursor } from '../lib/insertAtCursor.js';
import { messageApi } from '../api/index.js';
import { errorMessage } from '../api/apiClient.js';
import { useAuth } from '../context/AuthProvider.jsx';
import { useToast } from '../context/ToastProvider.jsx';
import { useSocket } from '../socket/SocketProvider.jsx';
import { useLive } from '../context/LiveProvider.jsx';
import { useCall } from '../context/CallProvider.jsx';
import { playSentPop, playReceivedPop } from '../lib/sound.js';

const TYPING_TIMEOUT = 2500;

// Mirrors backend/models/messageModel.js EDIT_WINDOW_MS. The server is the one
// that enforces it — this only decides whether to offer the button, so an
// expired edit is never presented as available and then refused.
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const canEdit = (message) =>
  Date.now() - new Date(message.createdAt).getTime() <= EDIT_WINDOW_MS;

// What a quoted reply shows for the message it points at — text takes
// priority, then the kind of attachment, mirroring the conversation list's
// own `previewFor` on the backend so the two never describe the same message
// differently.
const replySnippet = (target) => {
  if (!target || target.deletedAt) return 'This message was deleted';
  if (target.text) return target.text;
  if (target.mediaDuration != null) return 'Voice message';
  if (target.mediaType === 'video') return 'Video';
  return target.media ? 'Photo' : '';
};

// The quoted strip shown inside a bubble that replies to another message —
// and, unstyled, reused above the composer while a reply is queued up. Only
// the in-bubble use gets `onClick` — jumping to the original message means
// nothing for the composer's own preview of a reply not sent yet.
//
// A real `<button>` here would be invalid HTML the moment the bubble around
// it is one too (a plain text message renders as a `<button>` — see
// `BubbleTag`), so this is a div standing in for one, same as the audio/video
// player treatment further down: role, tabIndex, its own key handler, and a
// click that stops before it reaches the bubble's own "toggle timestamp"
// handler.
const ReplyQuote = ({ target, tone = 'bubble', onClick }) => (
  <div
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onClick={
      onClick
        ? (e) => {
            e.stopPropagation();
            onClick();
          }
        : undefined
    }
    onKeyDown={
      onClick
        ? (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            e.stopPropagation();
            onClick();
          }
        : undefined
    }
    className={cn(
      'mb-1.5 rounded-lg border-l-2 px-2 py-1 text-left text-[0.8125rem]',
      onClick && 'cursor-pointer transition hover:brightness-95',
      tone === 'bubble' ? 'border-current/40 bg-black/10' : 'border-primary-500 bg-sunken'
    )}>
    <p className={cn('font-semibold', tone !== 'bubble' && 'text-primary-600 dark:text-primary-400')}>
      {target?.sender?.displayName ?? 'Someone'}
    </p>
    <p className="line-clamp-1 opacity-80">{replySnippet(target)}</p>
  </div>
);

// Three states, not two. Shape carries delivery, colour carries reading:
//
//   ✓   muted   sent      — the server has it, their device does not
//   ✓✓  muted   delivered — it reached them, unopened
//   ✓✓  bright  read      — they opened the thread
//
// With only sent/read, "they are ignoring me" and "it never got there" render
// identically, which is the one question a receipt exists to answer.
const ReadReceipt = ({ deliveredAt, readAt }) => {
  const delivered = Boolean(deliveredAt || readAt);
  const read = Boolean(readAt);
  const label = read ? 'Read' : delivered ? 'Delivered' : 'Sent';

  return (
    <span
      className={cn('relative inline-flex h-3 shrink-0', delivered ? 'w-4' : 'w-3')}
      title={label}
      aria-label={label}>
      <Icon
        name="check"
        strokeWidth="3"
        className={cn('absolute left-0 top-0 h-3 w-3', read ? 'text-sky-300' : 'text-primary-200')}
      />
      {delivered && (
        <Icon
          name="check"
          strokeWidth="3"
          className={cn(
            'absolute left-[5px] top-0 h-3 w-3',
            read ? 'text-sky-300' : 'text-primary-200'
          )}
        />
      )}
    </span>
  );
};

// Selection checkbox for "delete for me" mode — sits at the same leading
// edge for every row regardless of which side the bubble itself is aligned
// to, matching how WhatsApp keeps its selection column steady while the
// bubbles it points at stay put.
const SelectCheckbox = ({ checked, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={checked ? 'Deselect message' : 'Select message'}
    aria-pressed={checked}
    className="shrink-0 p-1">
    <span
      className={cn(
        'flex h-5 w-5 items-center justify-center rounded-full border-2 transition',
        checked ? 'border-primary-600 bg-primary-600' : 'border-line-strong'
      )}>
      {checked && <Icon name="check" strokeWidth="3" className="h-3 w-3 text-white" />}
    </span>
  </button>
);

// One row of the message action sheet — icon, label, tap to run and close.
// `tone="danger"` is the only variant, reserved for Delete: everything else
// in the sheet is routine enough not to need its own colour.
const ActionRow = ({ icon, label, onClick, tone }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[0.9375rem] font-medium transition hover:bg-sunken',
      tone === 'danger' ? 'text-rose-600 dark:text-rose-400' : 'text-ink'
    )}>
    <Icon name={icon} className="h-[18px] w-[18px]" />
    {label}
  </button>
);

// A rightward drag on any bubble — yours or theirs — reveals a reply icon
// and springs back the instant it is released, the same gesture WhatsApp,
// Instagram and TikTok all share for "reply to this one." It never reveals a
// persistent action the way MessagesPage's own SwipeableRow does (that one
// stays open for a tap on Delete); this one fires once, on release, and
// always snaps back to zero — there is nothing to leave open.
const REPLY_TRIGGER = 56;
const REPLY_MAX = 80;
// Below this many pixels of horizontal movement, a gesture still counts as a
// tap. Without the threshold, `setPointerCapture` would be the obvious way to
// keep tracking the pointer past the row's own edge, but it retargets the
// resulting `click` to the capturing element — which silently breaks every
// tap the bubble itself needs (opening the timestamp, playing an attachment).
// Tracking via `window` listeners, armed only once real movement is seen,
// sidesteps that: a tap that never crosses the threshold never touches
// pointer capture at all, and reaches the bubble exactly as if this wrapper
// were not here.
const SWIPE_ARM_THRESHOLD = 6;

const SwipeToReply = ({ onReply, children }) => {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartX = useRef(0);
  const armed = useRef(false);
  const triggered = useRef(false);
  const onWindowMove = useRef(null);
  const onWindowUp = useRef(null);

  const detach = () => {
    window.removeEventListener('pointermove', onWindowMove.current);
    window.removeEventListener('pointerup', onWindowUp.current);
    window.removeEventListener('pointercancel', onWindowUp.current);
  };

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragStartX.current = e.clientX;
    armed.current = false;
    triggered.current = false;

    onWindowMove.current = (moveEvent) => {
      const delta = moveEvent.clientX - dragStartX.current;
      if (!armed.current) {
        if (Math.abs(delta) < SWIPE_ARM_THRESHOLD) return;
        armed.current = true;
      }
      // Leftward movement reveals nothing — reply is the only action here, so
      // there is nothing on that side to uncover.
      const clamped = Math.max(0, Math.min(delta, REPLY_MAX));
      setDragging(true);
      setOffset(clamped);
      if (!triggered.current && clamped >= REPLY_TRIGGER) {
        triggered.current = true;
        navigator.vibrate?.(10);
      }
    };

    onWindowUp.current = () => {
      detach();
      setDragging(false);
      setOffset(0);
      if (triggered.current) onReply();
    };

    window.addEventListener('pointermove', onWindowMove.current);
    window.addEventListener('pointerup', onWindowUp.current);
    window.addEventListener('pointercancel', onWindowUp.current);
  };

  return (
    <div className="relative flex-1" onPointerDown={onPointerDown} style={{ touchAction: 'pan-y' }}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 flex items-center text-primary-500"
        style={{ opacity: Math.min(offset / REPLY_TRIGGER, 1) }}>
        <Icon name="reply" className="h-5 w-5" />
      </div>
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 200ms ease-out',
        }}>
        {children}
      </div>
    </div>
  );
};

const ConversationPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const { on, emit, onlineUsers } = useSocket();
  const { call, startCall } = useCall();
  const { refresh } = useLive();

  const [messages, setMessages] = useState([]);
  const [partner, setPartner] = useState(null);
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState(null);
  // The message a swipe-to-reply gesture (or the reply menu item) has queued
  // up — shown as a quoted strip above the composer, cleared on send or by
  // its own dismiss button.
  const [replyingTo, setReplyingTo] = useState(null);
  // The message a reply-quote was just clicked into — briefly styled so the
  // jump reads as "here it is," not just an unexplained scroll.
  const [highlightedId, setHighlightedId] = useState(null);
  const highlightTimer = useRef(null);

  const scrollToMessage = (targetId) => {
    const el = targetId && document.getElementById(`msg-${targetId}`);
    // The target may not be loaded yet — older messages page in on scroll —
    // so there is nothing to jump to until that catches up. Silent no-op
    // rather than a toast for what is, from here, an edge case.
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    clearTimeout(highlightTimer.current);
    setHighlightedId(targetId);
    highlightTimer.current = setTimeout(() => setHighlightedId(null), 1600);
  };

  useEffect(() => () => clearTimeout(highlightTimer.current), []);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Seconds elapsed, or null when nothing is being recorded. A count rather
  // than a boolean because the timer running visibly is the whole point of a
  // voice-note recorder — silence with no clock would look frozen, not idle.
  const [recordingSeconds, setRecordingSeconds] = useState(null);

  const bottom = useRef(null);
  const typingSent = useRef(0);
  const typingTimer = useRef(null);
  const fileInput = useRef(null);
  const textInput = useRef(null);
  const mediaRecorder = useRef(null);
  const recordedChunks = useRef([]);
  const recordingStream = useRef(null);
  const recordingTimer = useRef(null);
  // Ids that arrived while this thread was open, so the slam plays for a
  // message as it lands and never for the backlog rendered on first load —
  // forty bubbles slamming in at once on open would be a mess, not a flourish.
  const [slammed, setSlammed] = useState(() => new Set());
  const markSlam = (id) => setSlammed((prev) => new Set(prev).add(id));

  // Which bubble is expanded to show its exact times. Tapping is how the
  // detail is reached, so the bubble itself stays down to text + time + ticks
  // rather than carrying a second timestamp it almost never needs.
  const [openDetail, setOpenDetail] = useState(null);
  const [editing, setEditing] = useState(null);
  // The message a delete is pending confirmation for — set by tapping
  // "Delete", cleared either by confirming or backing out. Deleting is
  // permanent (no edit-style time window undoes it), so it gets the one
  // extra tap WhatsApp asks for before it actually happens.
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Multi-select delete mirrors WhatsApp's real rule per message, not one
  // choice for the whole batch: a message you sent, still inside the same
  // 15-minute edit window, gets the shared tombstone both sides see. Anything
  // older, or anything the other person sent, only clears from your own view
  // — there is no version of "erase what someone else said" available here,
  // on principle, not just as a technical limit. WhatsApp reaches selection
  // through a long-press; a tap-triggered "Select" affordance does the same
  // job without a gesture that has no reliable desktop equivalent.
  const [selected, setSelected] = useState(null); // null = not in select mode; Set = selection in progress
  const [confirmHide, setConfirmHide] = useState(false);

  const enterSelectMode = (messageId) => {
    setOpenDetail(null);
    setSelected(new Set([messageId]));
  };

  const toggleSelected = (messageId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  const exitSelectMode = () => setSelected(null);

  const selectedMessages = selected ? messages.filter((m) => selected.has(m._id)) : [];
  // The message the action sheet (`openDetail`, an id) is currently open
  // for — looked up fresh on every render so an edit or a delivered/read
  // update that lands while the sheet is open is reflected immediately.
  // Excludes a deleted message: `openDetail` doing double duty as that
  // tombstone's own inline reveal-Select toggle must not also pop this sheet.
  const detailMessage = openDetail
    ? messages.find((m) => m._id === openDetail && !m.deletedAt)
    : null;
  const canDeleteForEveryone = (message) =>
    message.sender?._id === user?.id && !message.deletedAt && canEdit(message);
  // All-or-nothing, not per message: "delete for everyone" is only on offer
  // when every single selected message qualifies for it. The moment the
  // selection includes so much as one of the other person's messages, or one
  // of your own past the window, that option disappears entirely rather than
  // silently splitting the batch — a selection that mixes both kinds only
  // ever gets "delete for me," same as if none of them qualified.
  const everyoneEligible = selectedMessages.length > 0 && selectedMessages.every(canDeleteForEveryone);

  const deleteSelectedForMe = async () => {
    const ids = selectedMessages.map((m) => m._id);
    setConfirmHide(false);
    setSelected(null);
    try {
      await Promise.all(ids.map((messageId) => messageApi.hide(id, messageId)));
      setMessages((prev) => prev.filter((m) => !ids.includes(m._id)));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete those messages'));
    }
  };

  const deleteSelectedForEveryone = async () => {
    const ids = selectedMessages.map((m) => m._id);
    setConfirmHide(false);
    setSelected(null);
    try {
      const results = await Promise.all(ids.map((messageId) => messageApi.remove(id, messageId)));
      const byId = new Map(results.map(({ data }) => [data.message._id, data.message]));
      setMessages((prev) => prev.map((m) => byId.get(m._id) ?? m));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete those messages'));
    }
  };

  const beginEdit = (message) => {
    setOpenDetail(null);
    setEditing({ id: message._id, text: message.text });
  };

  const saveEdit = async () => {
    const next = editing.text.trim();
    if (!next) return;
    const target = messages.find((m) => m._id === editing.id);
    if (next === target?.text) return setEditing(null);

    try {
      const { data } = await messageApi.edit(id, editing.id, next);
      setMessages((prev) => prev.map((m) => (m._id === data.message._id ? data.message : m)));
      setEditing(null);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not edit that message'));
    }
  };

  const removeMessage = async (messageId) => {
    setOpenDetail(null);
    setConfirmDelete(null);
    try {
      const { data } = await messageApi.remove(id, messageId);
      setMessages((prev) => prev.map((m) => (m._id === data.message._id ? data.message : m)));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete that message'));
    }
  };

  const hideMessage = async (messageId) => {
    setOpenDetail(null);
    setConfirmDelete(null);
    try {
      await messageApi.hide(id, messageId);
      setMessages((prev) => prev.filter((m) => m._id !== messageId));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete that message'));
    }
  };

  const pickEmoji = (emoji) => {
    const { next, cursor } = insertAtCursor(textInput.current, text, emoji);
    setText(next);
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      textInput.current?.focus();
      textInput.current?.setSelectionRange(cursor, cursor);
    });
  };

  const scrollToBottom = (behavior = 'smooth') =>
    bottom.current?.scrollIntoView({ behavior, block: 'end' });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPartnerTyping(false);

    const load = async () => {
      try {
        const [{ data: list }, { data: convos }] = await Promise.all([
          messageApi.messages(id, { limit: 40 }),
          messageApi.conversations(),
        ]);
        if (cancelled) return;
        setMessages(list.items);
        setPartner(convos.items.find((c) => c.id === id)?.participant ?? null);

        // Read state is written over HTTP, not the socket, so a dropped
        // connection cannot lose it.
        await messageApi.markRead(id);
        refresh();
      } catch (err) {
        if (cancelled) return;
        // A conversation you are not a participant in reports as missing. Being
        // left parked on its URL is how a stale or shared link keeps looking
        // like it half-worked, so bounce back to the list.
        if ([403, 404].includes(err.response?.status)) {
          navigate('/messages', { replace: true });
          return;
        }
        toast.error(errorMessage(err, 'Could not open that conversation'));
      } finally {
        if (!cancelled) {
          setLoading(false);
          requestAnimationFrame(() => scrollToBottom('auto'));
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Membership is verified server-side before the join is granted, so a bad id
  // here simply does not get a room.
  useEffect(() => {
    emit('conversation:join', id, (result) => {
      if (result && result.ok === false) toast.error('You are not part of that conversation');
    });
    return () => emit('conversation:leave', id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, emit]);

  useEffect(() => {
    const offMessage = on('message:new', ({ conversationId, message }) => {
      if (conversationId !== id) return;
      setMessages((prev) =>
        prev.some((m) => m._id === message._id) ? prev : [...prev, message]
      );
      markSlam(message._id);
      setPartnerTyping(false);
      requestAnimationFrame(() => scrollToBottom());

      // Reading it as it arrives is the same as reading it — mark it so the
      // badge does not light for a thread that is on screen.
      if (message.sender?._id !== user?.id) {
        messageApi.markRead(id).then(refresh).catch(() => {});
        // Only the incoming half plays here — a message you sent yourself
        // pops from inside `send`, right on the tap that caused it, rather
        // than waiting for its own socket echo to come back.
        playReceivedPop();
      }
    });

    const offTypingStart = on('typing:start', ({ conversationId, userId }) => {
      if (conversationId !== id) return;
      // Your own typing must never render as the other person typing.
      if (String(userId) === String(user?.id)) return;
      setPartnerTyping(true);
      clearTimeout(typingTimer.current);
      // The stop event can be lost, so the indicator expires on its own rather
      // than hanging forever.
      typingTimer.current = setTimeout(() => setPartnerTyping(false), TYPING_TIMEOUT + 1000);
    });

    const offTypingStop = on('typing:stop', ({ conversationId, userId }) => {
      if (conversationId !== id) return;
      if (String(userId) === String(user?.id)) return;
      setPartnerTyping(false);
    });

    const offRead = on('message:read', ({ conversationId }) => {
      if (conversationId !== id) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.sender?._id === user?.id
            ? { ...m, readAt: m.readAt ?? new Date(), deliveredAt: m.deliveredAt ?? new Date() }
            : m
        )
      );
    });

    // Sent while they were offline; they have just reconnected.
    const offDelivered = on('message:delivered', ({ conversationId, deliveredAt }) => {
      if (conversationId !== id) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.sender?._id === user?.id && !m.deliveredAt
            ? { ...m, deliveredAt: deliveredAt ?? new Date() }
            : m
        )
      );
    });

    // Edits and deletes replace the whole message rather than patching fields,
    // so the bubble, its "edited" label and the tombstone all come from one
    // authoritative copy instead of being reassembled on the client.
    const replaceMessage = ({ conversationId, message }) => {
      if (conversationId !== id) return;
      setMessages((prev) => prev.map((m) => (m._id === message._id ? message : m)));
    };
    const offEdited = on('message:edited', replaceMessage);
    const offDeleted = on('message:deleted', replaceMessage);

    return () => {
      offMessage();
      offTypingStart();
      offTypingStop();
      offRead();
      offDelivered();
      offEdited();
      offDeleted();
      clearTimeout(typingTimer.current);
    };
  }, [on, id, user?.id, refresh]);

  const onType = (event) => {
    setText(event.target.value);
    const now = Date.now();
    // Throttled: one typing event per interval rather than one per keystroke.
    if (now - typingSent.current > TYPING_TIMEOUT) {
      typingSent.current = now;
      emit('typing:start', { conversationId: id });
    }
  };

  const pickAttachment = (file) => {
    if (!file) return;
    const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null;
    if (!kind) return;
    if (attachment) URL.revokeObjectURL(attachment.preview);
    setAttachment({ file, kind, preview: URL.createObjectURL(file) });
  };

  const clearAttachment = () => {
    if (attachment) URL.revokeObjectURL(attachment.preview);
    setAttachment(null);
  };

  const send = async (event) => {
    event.preventDefault();
    const body = text.trim();
    if ((!body && !attachment) || sending) return;

    setSending(true);
    setText('');
    const attachedFile = attachment;
    const repliedTo = replyingTo;
    clearAttachment();
    setReplyingTo(null);
    emit('typing:stop', { conversationId: id });

    try {
      const { data } = attachedFile
        ? await messageApi.sendWithMedia(
            id,
            (() => {
              const form = new FormData();
              form.append('text', body);
              form.append(attachedFile.kind, attachedFile.file);
              if (repliedTo) form.append('replyTo', repliedTo._id);
              return form;
            })()
          )
        : await messageApi.send(id, body, repliedTo?._id);

      // The socket echo is filtered by id, so a sender who is also in the room
      // does not see their own message twice.
      setMessages((prev) =>
        prev.some((m) => m._id === data.message._id) ? prev : [...prev, data.message]
      );
      markSlam(data.message._id);
      requestAnimationFrame(() => scrollToBottom());
      playSentPop();
    } catch (err) {
      setText(body);
      if (attachedFile) setAttachment(attachedFile);
      if (repliedTo) setReplyingTo(repliedTo);
      toast.error(errorMessage(err, 'That message did not send'));
    } finally {
      setSending(false);
    }
  };

  // Recording favours the widest-supported codec Chrome/Firefox/Safari each
  // actually produce over forcing one, since MediaRecorder throws rather than
  // falling back on its own for a mimeType the browser cannot encode.
  const recorderMimeType = () =>
    ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) =>
      window.MediaRecorder?.isTypeSupported?.(type)
    ) ?? '';

  const releaseRecordingStream = () => {
    clearInterval(recordingTimer.current);
    recordingStream.current?.getTracks().forEach((track) => track.stop());
    recordingStream.current = null;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStream.current = stream;
      recordedChunks.current = [];
      const mimeType = recorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunks.current.push(event.data);
      };
      recorder.start();
      mediaRecorder.current = recorder;
      setRecordingSeconds(0);
      recordingTimer.current = setInterval(
        () => setRecordingSeconds((prev) => (prev === null ? prev : prev + 1)),
        1000
      );
    } catch {
      toast.error('Could not access your microphone');
    }
  };

  const cancelRecording = () => {
    const recorder = mediaRecorder.current;
    mediaRecorder.current = null;
    releaseRecordingStream();
    setRecordingSeconds(null);
    // No onstop handler attached — a cancel has nothing left to do with the
    // recorded chunks, so it never gets one and there is nothing to upload.
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  const sendRecording = () => {
    const recorder = mediaRecorder.current;
    if (!recorder) return;
    const seconds = recordingSeconds ?? 0;
    mediaRecorder.current = null;

    recorder.onstop = async () => {
      releaseRecordingStream();
      setRecordingSeconds(null);
      const blob = new Blob(recordedChunks.current, { type: recorder.mimeType || 'audio/webm' });
      recordedChunks.current = [];
      if (blob.size === 0) return;

      setSending(true);
      try {
        const form = new FormData();
        const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
        form.append('audio', blob, `voice.${ext}`);
        form.append('duration', String(seconds));
        const { data } = await messageApi.sendWithMedia(id, form);
        setMessages((prev) =>
          prev.some((m) => m._id === data.message._id) ? prev : [...prev, data.message]
        );
        markSlam(data.message._id);
        requestAnimationFrame(() => scrollToBottom());
        playSentPop();
      } catch (err) {
        toast.error(errorMessage(err, 'That voice message did not send'));
      } finally {
        setSending(false);
      }
    };
    if (recorder.state !== 'inactive') recorder.stop();
  };

  // A tab closed or navigated away from mid-recording must not leave the
  // microphone's indicator light on.
  useEffect(() => releaseRecordingStream, []);

  const online = partner && onlineUsers.has(String(partner.id));

  return (
    <div className="flex h-full flex-col">
      <header className="divider glass flex items-center gap-3 px-4 py-2.5">
        {selected ? (
          <>
            <button
              type="button"
              onClick={exitSelectMode}
              aria-label="Cancel selection"
              className="-ml-2 rounded-full p-2 transition hover:bg-sunken">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
            <p className="flex-1 text-sm font-bold">{selected.size} selected</p>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => navigate('/messages')}
              aria-label="Back to messages"
              className="-ml-2 rounded-full p-2 transition hover:bg-sunken md:hidden">
              <Icon name="back" className="h-5 w-5" />
            </button>

            {partner && (
              <>
                <Avatar user={partner} size="sm" online={online} />
                <div className="min-w-0 flex-1">
                  <Link to={`/${partner.handle}`} className="block truncate text-sm font-bold hover:underline">
                    {partner.displayName}
                  </Link>
                  <p className="handle truncate">
                    {online ? 'Online now' : `Last seen ${relativeTime(partner.lastSeenAt)}`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => startCall(id, partner, 'audio')}
                  disabled={Boolean(call)}
                  aria-label="Start a voice call"
                  className="rounded-full p-2.5 text-ink-soft transition hover:bg-sunken disabled:pointer-events-none disabled:opacity-40">
                  <Icon name="phone" className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => startCall(id, partner, 'video')}
                  disabled={Boolean(call)}
                  aria-label="Start a video call"
                  className="rounded-full p-2.5 text-ink-soft transition hover:bg-sunken disabled:pointer-events-none disabled:opacity-40">
                  <Icon name="video" className="h-5 w-5" />
                </button>
              </>
            )}
          </>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            No messages yet. Say hello.
          </p>
        ) : (
          <ul className="space-y-2">
            {messages.map((message) => {
              const mine = message.sender?._id === user?.id;
              const gone = Boolean(message.deletedAt);
              const isEditing = editing?.id === message._id;
              const showDetail = openDetail === message._id;
              const hasAudio = message.mediaDuration != null;
              const hasVideo = message.mediaType === 'video';
              // A native <audio>/<video controls> player is itself interactive
              // content, which HTML does not allow nesting inside a real
              // <button> — see the comment further down where the player
              // stops its own clicks from bubbling.
              const BubbleTag = hasAudio || hasVideo ? 'div' : 'button';

              // A deleted message keeps its slot so the thread does not
              // silently reshuffle, and says plainly that something was there.
              // It is still selectable for "delete for me" — clearing that
              // tombstone out of just this account's own view is the one
              // thing left to do with a message once it is already gone for
              // both sides.
              if (gone)
                return (
                  <li key={message._id} id={`msg-${message._id}`} className="flex items-center gap-2">
                    {selected && (
                      <SelectCheckbox
                        checked={selected.has(message._id)}
                        onClick={() => toggleSelected(message._id)}
                      />
                    )}
                    <div className={cn('flex flex-1 flex-col', mine ? 'items-end' : 'items-start')}>
                      <button
                        type="button"
                        onClick={() =>
                          selected
                            ? toggleSelected(message._id)
                            : setOpenDetail(showDetail ? null : message._id)
                        }
                        aria-expanded={showDetail}
                        className="flex max-w-[78%] items-center gap-1.5 rounded-2xl border border-dashed border-line-strong px-3.5 py-2 text-left text-[0.8125rem] italic text-muted">
                        <Icon name="trash" className="h-3.5 w-3.5 shrink-0" />
                        {mine ? 'You deleted this message' : 'This message was deleted'}
                        <span className="not-italic">· {relativeTime(message.createdAt)}</span>
                      </button>

                      {/* Same tap-to-reveal pattern as every other bubble —
                          a single tap toggling straight into select mode was
                          a keystroke that skipped the deliberate step every
                          other message gets. */}
                      <div
                        className={cn(
                          'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
                          showDetail ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                        )}>
                        <div className="overflow-hidden">
                          <div
                            className={cn(
                              'mt-1 flex items-center gap-2 px-1 text-[0.6875rem] text-muted',
                              mine ? 'justify-end' : 'justify-start'
                            )}>
                            <span>{fullDate(message.createdAt)}</span>
                            <button
                              type="button"
                              onClick={() => enterSelectMode(message._id)}
                              className="font-semibold text-ink-soft hover:underline">
                              Select
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                );

              if (isEditing)
                return (
                  <li key={message._id} className="flex justify-end">
                    <div className="w-full max-w-[78%] rounded-2xl border border-primary-400 bg-surface p-2">
                      <textarea
                        value={editing.text}
                        onChange={(e) => setEditing((p) => ({ ...p, text: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            saveEdit();
                          }
                          if (e.key === 'Escape') setEditing(null);
                        }}
                        rows={2}
                        aria-label="Edit message"
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                        className="field resize-none text-[0.9375rem]"
                      />
                      <div className="mt-1.5 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="btn-outline px-3 py-1 text-[0.8125rem]">
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={saveEdit}
                          className="btn-primary px-3 py-1 text-[0.8125rem]">
                          Save
                        </button>
                      </div>
                    </div>
                  </li>
                );

              const bubble = (
                  <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[78%]', mine ? 'items-end' : 'items-start')}>
                    {/* A native <audio controls> player is itself interactive
                        content, which HTML does not allow nesting inside a
                        real <button> — so an audio bubble is a div standing
                        in for one (role, tabIndex, the same click handler)
                        rather than an actual button, and the player stops its
                        own clicks from bubbling to that handler so pressing
                        play does not also toggle the timestamp detail. */}
                    <BubbleTag
                      type={hasAudio || hasVideo ? undefined : 'button'}
                      role={hasAudio || hasVideo ? 'button' : undefined}
                      tabIndex={hasAudio || hasVideo ? 0 : undefined}
                      onClick={() =>
                        selected ? toggleSelected(message._id) : setOpenDetail(message._id)
                      }
                      onKeyDown={
                        hasAudio || hasVideo
                          ? (e) => {
                              if (e.key !== 'Enter' && e.key !== ' ') return;
                              e.preventDefault();
                              selected ? toggleSelected(message._id) : setOpenDetail(message._id);
                            }
                          : undefined
                      }
                      aria-haspopup="dialog"
                      className={cn(
                        'block w-full overflow-hidden rounded-2xl text-left transition-shadow duration-500',
                        // The bubble scales from its own corner rather than its
                        // centre, so it reads as landing against the edge it is
                        // anchored to instead of ballooning out of the middle.
                        slammed.has(message._id) &&
                          cn('animate-slam', mine ? 'origin-bottom-right' : 'origin-bottom-left'),
                        message.text || !message.media ? 'px-3.5 py-2' : 'p-1',
                        mine
                          ? 'rounded-br-md bg-primary-600 text-white'
                          : 'rounded-bl-md bg-sunken',
                        // A tap on a reply-quote jumps here and flashes this
                        // ring so the jump reads as "here it is," not just an
                        // unexplained scroll — it fades back out on its own via
                        // the `transition-shadow` above once the timer clears
                        // `highlightedId`, rather than needing a second class
                        // swap to animate the exit.
                        highlightedId === message._id && 'ring-2 ring-secondary-400 ring-offset-2 ring-offset-canvas'
                      )}>
                      {message.replyTo && (
                        <ReplyQuote
                          target={message.replyTo}
                          onClick={() => scrollToMessage(message.replyTo._id)}
                        />
                      )}
                      {hasAudio ? (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className={cn(message.text && 'mb-2')}>
                          <audio
                            controls
                            preload="metadata"
                            src={mediaUrl(message.media)}
                            className="h-10 max-w-full"
                          />
                        </div>
                      ) : hasVideo ? (
                        message.media && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className={cn(message.text && 'mb-2')}>
                            <video
                              controls
                              preload="metadata"
                              src={mediaUrl(message.media)}
                              className="max-h-72 w-full rounded-xl"
                            />
                          </div>
                        )
                      ) : (
                        message.media && (
                          <img
                            src={mediaUrl(message.media)}
                            alt=""
                            loading="lazy"
                            className={cn(
                              'max-h-72 w-full rounded-xl object-cover',
                              message.text && 'mb-2'
                            )}
                          />
                        )
                      )}
                      {message.text && (
                        <p className="whitespace-pre-wrap break-words text-[0.9375rem]">{message.text}</p>
                      )}
                      <span
                        className={cn(
                          'mt-0.5 flex items-center justify-end gap-1 text-[0.6875rem]',
                          !message.text && message.media && 'px-2.5 pb-1',
                          mine ? 'text-primary-200' : 'text-muted'
                        )}>
                        {relativeTime(message.createdAt)}
                        {/* Permanent, and deliberately not a timestamp. With
                            read receipts an edit can land on a message the
                            other person already read, so the fact that it
                            changed has to stay visible. */}
                        {message.editedAt && <span>· edited</span>}
                        {mine && (
                          <ReadReceipt
                            deliveredAt={message.deliveredAt}
                            readAt={message.readAt}
                          />
                        )}
                      </span>
                    </BubbleTag>
                  </div>
                  </div>
              );

              return (
                <li key={message._id} id={`msg-${message._id}`} className="flex items-center gap-2">
                  {selected && (
                    <SelectCheckbox
                      checked={selected.has(message._id)}
                      onClick={() => toggleSelected(message._id)}
                    />
                  )}
                  {/* Select mode already repurposes a tap for checking a row
                      off — layering a swipe gesture on top of that too would
                      mean the same drag means two different things depending
                      on mode, so it is switched off entirely while selecting. */}
                  {selected ? (
                    <div className="flex-1">{bubble}</div>
                  ) : (
                    <SwipeToReply onReply={() => setReplyingTo(message)}>{bubble}</SwipeToReply>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {partnerTyping && (
          <div className="mt-2 flex items-center gap-1.5 px-1" aria-live="polite">
            <span className="text-xs text-muted">
              {partner?.displayName} is typing
            </span>
            <span className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </span>
          </div>
        )}

        <div ref={bottom} />
      </div>

      {selected ? (
        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={() => setConfirmHide(true)}
            disabled={selected.size === 0}
            aria-label="Delete selected messages"
            className="rounded-full p-2.5 text-rose-600 transition hover:bg-rose-500/10 disabled:pointer-events-none disabled:opacity-40 dark:text-rose-400">
            <Icon name="trash" className="h-5 w-5" />
          </button>
          <p className="text-sm font-semibold">{selected.size} selected</p>
        </div>
      ) : (
      <form onSubmit={send} className="border-t border-line p-2">
        {replyingTo && (
          <div className="mb-2 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <ReplyQuote target={replyingTo} tone="composer" />
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              aria-label="Cancel reply"
              className="shrink-0 rounded-full p-1.5 text-muted transition hover:bg-line/60 hover:text-ink">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}

        {attachment && (
          <div className="relative mb-2 inline-block">
            {attachment.kind === 'video' ? (
              <video src={attachment.preview} muted className="h-20 w-20 rounded-xl object-cover" />
            ) : (
              <img src={attachment.preview} alt="" className="h-20 w-20 rounded-xl object-cover" />
            )}
            <button
              type="button"
              onClick={clearAttachment}
              aria-label={attachment.kind === 'video' ? 'Remove video' : 'Remove image'}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-ink p-1 text-canvas transition hover:opacity-80">
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="image/*,video/mp4,video/webm,video/quicktime"
          hidden
          onChange={(e) => {
            pickAttachment(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        {/* One pill, not four stacked controls — attach and emoji live inside
            it rather than beside it. Only emoji steps aside once there is
            something to send: attach stays, because a reader who writes a
            caption first and only then wants to attach the photo needs it
            reachable the whole time — hiding it on the first keystroke would
            mean clearing a half-written caption just to get it back. Emoji
            has no such trap, since the OS keyboard's own picker is still a
            thumb-tap away regardless of what this button does. */}
        <div className="field flex items-end gap-1 rounded-2xl border-line py-1.5 pl-1.5 pr-2 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/25">
          {recordingSeconds !== null ? (
            <>
              <button
                type="button"
                onClick={cancelRecording}
                aria-label="Cancel recording"
                className="inline-flex shrink-0 items-center justify-center rounded-full p-2 text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-400">
                <Icon name="trash" className="h-[18px] w-[18px]" />
              </button>

              {/* A steady clock, not a waveform — this is a tap-to-record
                  flow, not a slide-to-cancel one, so the one thing worth
                  showing while it runs is how long the note already is. */}
              <div className="flex flex-1 items-center gap-2 px-1.5 py-1.5 text-sm text-ink-soft">
                <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-rose-500" />
                <span className="metric">
                  {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}
                </span>
                <span className="text-muted">Recording…</span>
              </div>

              <button
                type="button"
                onClick={sendRecording}
                aria-label="Send voice message"
                className="btn-primary shrink-0 p-2.5">
                <Icon name="send" className="h-[18px] w-[18px]" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                aria-label="Attach a photo or video"
                className="inline-flex shrink-0 items-center justify-center rounded-full p-2 text-primary-600 transition hover:bg-primary-500/10 dark:text-primary-400">
                <Icon name="image" className="h-[18px] w-[18px]" />
              </button>

              {/* Hidden below `sm` always — a phone's own keyboard already has
                  an emoji panel a thumb-tap away. From `sm` up it also steps
                  aside once there is text or an attachment queued, freeing
                  space for the send button without losing anything a
                  trackpad-and-keyboard visitor couldn't reach another way. */}
              {!text && !attachment && (
                <div className="relative hidden shrink-0 sm:block">
                  <button
                    type="button"
                    onClick={() => setEmojiOpen((v) => !v)}
                    aria-label="Add an emoji"
                    aria-expanded={emojiOpen}
                    className="inline-flex items-center justify-center rounded-full p-2 text-base leading-none transition hover:bg-sunken">
                    🙂
                  </button>
                  {emojiOpen && <EmojiPicker onPick={pickEmoji} onClose={() => setEmojiOpen(false)} />}
                </div>
              )}

              <textarea
                ref={textInput}
                value={text}
                onChange={onType}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter breaks the line — the convention
                  // every chat app has trained people on.
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(e);
                  }
                }}
                rows={1}
                placeholder="Write a message"
                aria-label="Write a message"
                className="max-h-32 min-w-0 flex-1 resize-none border-0 bg-transparent p-1.5 !ring-0 focus:outline-none"
              />

              {/* The mic swaps in exactly where Send sits, and only Send is
                  ever there once there is something typed or attached — one
                  slot, one action, never both fighting for the same corner. */}
              {text.trim() || attachment ? (
                <button
                  type="submit"
                  disabled={sending}
                  aria-label="Send message"
                  className="btn-primary shrink-0 p-2.5">
                  <Icon name="send" className="h-[18px] w-[18px]" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startRecording}
                  aria-label="Record a voice message"
                  className="inline-flex shrink-0 items-center justify-center rounded-full p-2.5 text-primary-600 transition hover:bg-primary-500/10 dark:text-primary-400">
                  <Icon name="mic" className="h-[18px] w-[18px]" />
                </button>
              )}
            </>
          )}
        </div>
      </form>
      )}

      {/* One tap on a bubble opens this instead of an inline row of links —
          the same "tap for a sheet of actions" pattern WhatsApp/Telegram/IG
          use, rather than a permanently-expanding strip under every message.
          Forward, star and pin are deliberately not here: nothing on the
          backend implements them yet, and a button that does nothing is
          worse than one that isn't offered. */}
      <Modal open={Boolean(detailMessage)} onClose={() => setOpenDetail(null)} title="Message">
        {detailMessage && (
          <div onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 space-y-0.5 rounded-lg bg-sunken px-3 py-2.5 text-[0.8125rem] text-muted">
              <p>Sent {fullDate(detailMessage.createdAt)}</p>
              {detailMessage.editedAt && <p>Edited {fullDate(detailMessage.editedAt)}</p>}
              {detailMessage.sender?._id === user?.id && (
                <p>
                  {detailMessage.readAt
                    ? 'Read'
                    : detailMessage.deliveredAt
                      ? 'Delivered, not yet read'
                      : 'Sent, not yet delivered'}
                </p>
              )}
            </div>

            <div className="space-y-0.5">
              <ActionRow
                icon="reply"
                label="Reply"
                onClick={() => {
                  setReplyingTo(detailMessage);
                  setOpenDetail(null);
                }}
              />
              {detailMessage.text && (
                <ActionRow
                  icon="copy"
                  label="Copy text"
                  onClick={async () => {
                    setOpenDetail(null);
                    try {
                      await navigator.clipboard.writeText(detailMessage.text);
                      toast.success('Copied');
                    } catch {
                      toast.error('Could not copy that');
                    }
                  }}
                />
              )}
              {detailMessage.sender?._id === user?.id && canEdit(detailMessage) && (
                <ActionRow icon="pencil" label="Edit" onClick={() => beginEdit(detailMessage)} />
              )}
              <ActionRow
                icon="checkCircle"
                label="Select"
                onClick={() => {
                  enterSelectMode(detailMessage._id);
                  setOpenDetail(null);
                }}
              />
              {/* Mine-only, same as before this was a sheet — the other
                  person's message can still be cleared from just your own
                  view, but only through Select, never a direct single tap. */}
              {detailMessage.sender?._id === user?.id && (
                <ActionRow
                  icon="trash"
                  label="Delete"
                  tone="danger"
                  onClick={() => {
                    setOpenDetail(null);
                    setConfirmDelete(detailMessage);
                  }}
                />
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} title="Delete message?">
        {confirmDelete && canDeleteForEveryone(confirmDelete) ? (
          <>
            <p className="text-sm text-ink-soft">
              Delete just for you, or for everyone? {partner?.displayName ?? 'The other person'}{' '}
              only finds out if you choose "everyone."
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="btn-outline px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => hideMessage(confirmDelete._id)}
                className="btn-outline px-4 py-2 text-sm">
                Delete for me
              </button>
              <button
                type="button"
                onClick={() => removeMessage(confirmDelete._id)}
                className="btn-danger px-4 py-2 text-sm">
                Delete for everyone
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-soft">
              It&apos;s been more than {Math.round(EDIT_WINDOW_MS / 60000)} minutes, so this only
              removes it from your own view — {partner?.displayName ?? 'the other person'} keeps
              seeing their side of the chat exactly as it is.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="btn-outline px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => hideMessage(confirmDelete._id)}
                className="btn-danger px-4 py-2 text-sm">
                Delete for me
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={confirmHide}
        onClose={() => setConfirmHide(false)}
        title={`Delete ${selectedMessages.length} message${selectedMessages.length === 1 ? '' : 's'}?`}>
        <p className="text-sm text-ink-soft">
          {everyoneEligible ? (
            <>
              Delete just for you, or for everyone? {partner?.displayName ?? 'The other person'}{' '}
              only finds out if you choose "everyone."
            </>
          ) : (
            <>
              This selection includes a message {partner?.displayName ?? 'the other person'} sent,
              or one of yours older than {Math.round(EDIT_WINDOW_MS / 60000)} minutes, so the whole
              batch can only be cleared from your own view — {partner?.displayName ?? 'they'} keep
              seeing their side of the chat exactly as it is.
            </>
          )}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmHide(false)}
            className="btn-outline px-4 py-2 text-sm">
            Cancel
          </button>
          {everyoneEligible ? (
            <>
              <button
                type="button"
                onClick={deleteSelectedForMe}
                className="btn-outline px-4 py-2 text-sm">
                Delete for me
              </button>
              <button
                type="button"
                onClick={deleteSelectedForEveryone}
                className="btn-danger px-4 py-2 text-sm">
                Delete for everyone
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={deleteSelectedForMe}
              className="btn-danger px-4 py-2 text-sm">
              Delete for me
            </button>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default ConversationPage;
