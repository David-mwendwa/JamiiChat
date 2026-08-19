import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import Icon from '../components/ui/Icon.jsx';
import Modal from '../components/ui/Modal.jsx';
import cn from '../lib/cn.js';
import { relativeTime } from '../lib/format.js';
import { messageApi } from '../api/index.js';
import { errorMessage } from '../api/apiClient.js';
import { useSocket } from '../socket/SocketProvider.jsx';
import { useLive } from '../context/LiveProvider.jsx';
import { useToast } from '../context/ToastProvider.jsx';

// Width of the delete button a leftward swipe reveals. Swipe-left-reveals-
// right is the direction every mail/chat app on iOS and Android already
// trained people on — the row's content drags left, uncovering a fixed
// action pinned to the right edge, never the other way round.
const REVEAL_WIDTH = 76;

// Below this many pixels of horizontal movement, a gesture still counts as a
// tap rather than a swipe — without a threshold, `setPointerCapture` (the
// obvious way to keep tracking the pointer once it leaves the row) turns out
// to retarget the resulting `click` event to the capturing div instead of
// wherever the pointer actually is, which silently breaks every ordinary tap
// on the Link underneath it. Tracking via `window` listeners, armed only once
// real movement is seen, sidesteps that retargeting entirely — a tap that
// never crosses the threshold never touches the pointer-capture machinery at
// all, so it reaches the Link exactly as if this wrapper were not here.
const SWIPE_THRESHOLD = 6;

const SwipeableRow = ({ onDelete, deleteLabel, children }) => {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartOffset = useRef(0);
  const swiping = useRef(false);

  const close = () => setOffset(0);

  const onWindowMove = useRef(null);
  const onWindowUp = useRef(null);

  const detachWindowListeners = () => {
    window.removeEventListener('pointermove', onWindowMove.current);
    window.removeEventListener('pointerup', onWindowUp.current);
    window.removeEventListener('pointercancel', onWindowUp.current);
  };

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragStartX.current = e.clientX;
    dragStartOffset.current = offset;
    swiping.current = false;

    onWindowMove.current = (moveEvent) => {
      const delta = moveEvent.clientX - dragStartX.current;
      if (!swiping.current) {
        if (Math.abs(delta) < SWIPE_THRESHOLD) return;
        swiping.current = true;
        setDragging(true);
      }
      setOffset(Math.min(0, Math.max(-REVEAL_WIDTH, dragStartOffset.current + delta)));
    };
    onWindowUp.current = () => {
      detachWindowListeners();
      setDragging(false);
      // Past the halfway point, snap fully open rather than settling
      // wherever the finger happened to lift — a swipe is a binary gesture
      // here (reveal or don't), not a freely-parkable position. A release
      // that never crossed the threshold leaves `offset` untouched, so a
      // plain tap never moves the row at all.
      if (swiping.current) setOffset((prev) => (prev < -REVEAL_WIDTH / 2 ? -REVEAL_WIDTH : 0));
    };

    window.addEventListener('pointermove', onWindowMove.current);
    window.addEventListener('pointerup', onWindowUp.current);
    window.addEventListener('pointercancel', onWindowUp.current);
  };

  return (
    <div className="relative overflow-hidden">
      <button
        type="button"
        onClick={() => {
          close();
          onDelete();
        }}
        aria-label={deleteLabel}
        style={{ width: REVEAL_WIDTH }}
        className="absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-1 bg-rose-600 text-white">
        <Icon name="trash" className="h-5 w-5" />
        <span className="text-[0.6875rem] font-semibold">Delete</span>
      </button>
      <div
        onPointerDown={onPointerDown}
        // Capture phase, ahead of the Link's own click: while the row is
        // open, the first tap on it should close the reveal, not navigate —
        // exactly like tapping elsewhere on an open iOS swipe action closes
        // it rather than triggering whatever sits underneath.
        onClickCapture={(e) => {
          if (offset !== 0) {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 200ms ease-out',
          touchAction: 'pan-y',
        }}
        className="relative bg-canvas">
        {children}
      </div>
    </div>
  );
};

const MessagesPage = () => {
  const { id } = useParams();
  const { on, onlineUsers } = useSocket();
  const { refresh } = useLive();
  const toast = useToast();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  // Set from the trash icon on a row, cleared on confirm or cancel — deleting
  // a chat drops it off the list entirely, so it gets the same one-tap-of-
  // confirmation treatment as any other delete in this app.
  const [confirmDeleteChat, setConfirmDeleteChat] = useState(null);

  const deleteChat = async () => {
    const convo = confirmDeleteChat;
    setConfirmDeleteChat(null);
    try {
      await messageApi.hideConversation(convo.id);
      setConversations((prev) => prev.filter((c) => c.id !== convo.id));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete that chat'));
    }
  };

  const load = () =>
    messageApi
      .conversations()
      .then(({ data }) => setConversations(data.items))
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  // The list reorders live. A message arriving in a thread that is not open
  // still moves that conversation to the top and lights its unread count.
  useEffect(() => {
    const off = on('conversation:updated', ({ conversationId, preview, lastMessageAt, unread }) => {
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === conversationId);
        if (!existing) {
          load();
          return prev;
        }
        const updated = {
          ...existing,
          lastMessagePreview: preview,
          lastMessageAt,
          unread: conversationId === id ? 0 : unread,
        };
        return [updated, ...prev.filter((c) => c.id !== conversationId)];
      });
    });
    return off;
  }, [on, id]);

  return (
    // Sized to the real viewport rather than relying on the document's normal
    // scroll (every other page's approach) because the composer at the bottom
    // has to stay pinned rather than scroll away — see ConversationPage. That
    // means this, not `<main>`'s usual `pb-16` padding, is what has to clear
    // the fixed BottomBar on mobile, or BottomBar physically covers the
    // composer's send button. `sm:h-screen` is the full viewport again once
    // BottomBar itself is hidden at that breakpoint.
    <div className="flex h-[calc(100dvh-var(--bottombar-h))] flex-col sm:h-screen">
      <PageHeader title="Messages" />

      <div className="flex min-h-0 flex-1">
        <div
          className={cn(
            'w-full shrink-0 overflow-y-auto border-line md:w-[320px] md:border-r lg:w-[360px]',
            id && 'hidden md:block'
          )}>
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : conversations.length === 0 ? (
            <EmptyState
              title="No messages yet"
              description="Open someone's profile and press the mail icon to start a conversation."
            />
          ) : (
            <ul>
              {conversations.map((convo) => (
                <li
                  key={convo.id}
                  className={cn('divider', convo.id === id && 'bg-primary-50 dark:bg-primary-950/30')}>
                  <SwipeableRow
                    onDelete={() => setConfirmDeleteChat(convo)}
                    deleteLabel={`Delete chat with ${convo.participant?.displayName ?? 'this person'}`}>
                    <Link
                      to={`/messages/${convo.id}`}
                      onClick={() => {
                        setConversations((prev) =>
                          prev.map((c) => (c.id === convo.id ? { ...c, unread: 0 } : c))
                        );
                        refresh();
                      }}
                      className="flex min-w-0 items-center gap-3 px-3 py-3 transition hover:bg-sunken">
                      <Avatar
                        user={convo.participant}
                        size="md"
                        link={false}
                        online={onlineUsers.has(String(convo.participant?.id)) || convo.participant?.online}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <p className="truncate text-sm font-bold">
                            {convo.participant?.displayName ?? 'Unknown'}
                          </p>
                          <time className="handle ml-auto shrink-0">
                            {relativeTime(convo.lastMessageAt)}
                          </time>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[0.8125rem] text-muted">
                            {convo.lastMessagePreview || 'No messages yet'}
                          </p>
                          {convo.unread > 0 && (
                            <span className="metric ml-auto shrink-0 rounded-full bg-secondary-500 px-1.5 text-[0.6875rem] font-bold text-dark-950">
                              {convo.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </SwipeableRow>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={cn('min-w-0 flex-1', !id && 'hidden md:block')}>
          {id ? (
            <Outlet />
          ) : (
            <EmptyState
              title="Pick a conversation"
              description="Choose one from the list, or start a new one from someone's profile."
            />
          )}
        </div>
      </div>

      <Modal
        open={Boolean(confirmDeleteChat)}
        onClose={() => setConfirmDeleteChat(null)}
        title="Delete this chat?">
        <p className="text-sm text-ink-soft">
          This removes it from your Messages list only —{' '}
          {confirmDeleteChat?.participant?.displayName ?? 'they'} won&apos;t know, and it comes
          back on its own the next time they message you.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmDeleteChat(null)}
            className="btn-outline px-4 py-2 text-sm">
            Cancel
          </button>
          <button type="button" onClick={deleteChat} className="btn-danger px-4 py-2 text-sm">
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default MessagesPage;
