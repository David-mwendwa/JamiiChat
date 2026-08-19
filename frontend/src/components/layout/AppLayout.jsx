import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import NavRail from './NavRail.jsx';
import BottomBar from './BottomBar.jsx';
import RightRail from './RightRail.jsx';
import Modal from '../ui/Modal.jsx';
import Composer from '../post/Composer.jsx';
import Icon from '../ui/Icon.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useAuth } from '../../context/AuthProvider.jsx';
import cn from '../../lib/cn.js';

// Three columns at desktop: nav rail, a feed column at a fixed width, and a
// contextual right rail.
//
// Every column width here is constant for every route. An earlier version gave
// Messages a wider main column and dropped the right rail, which meant moving
// between Messages and anything else visibly resized the whole shell — the nav
// rail slid sideways under the pointer mid-click. Screens that need a
// different internal arrangement do it inside this column, not by resizing it.
const AppLayout = () => {
  const [composing, setComposing] = useState(false);
  const toast = useToast();
  const { user } = useAuth();
  const { pathname } = useLocation();

  // Messages is a two-pane screen in its own right; trending tags and follow
  // suggestions alongside it are noise. It drops the right rail and takes the
  // freed width for the conversation itself.
  //
  // The trade-off is deliberate: the feed column is wider on Messages than
  // elsewhere, so the shell does change size when you move between tabs. The
  // nav rail is pinned to the same offset either way, so the thing under your
  // pointer does not move — only the reading column grows.
  const wide = pathname.startsWith('/messages');
  // An open conversation has its own composer with a send button sitting in
  // the same bottom-right corner as the floating "write a post" button — the
  // two visually collided. A thread already has a way to write something;
  // starting a new post from inside it is not a loss.
  const inConversation = /^\/messages\/[^/]+/.test(pathname);

  return (
    // The container is exactly the sum of its three columns (256 + 620 + 350).
    // With any slack, `justify-center` re-centres the row whenever Messages
    // widens the middle column, which slid the nav rail sideways. Sized to fit
    // exactly, there is nothing left to redistribute and the rail is pinned.
    <div className="mx-auto flex w-full max-w-[1226px] justify-center">
      <NavRail onCompose={() => setComposing(true)} />

      <main
        className={cn(
          'w-full border-line sm:border-x sm:pb-0',
          // Messages reserves BottomBar's clearance itself (its composer has
          // to stay pinned, so it manages its own viewport-height math rather
          // than relying on this padding during normal document scroll) —
          // `pb-16` here on top of that would double-reserve the space.
          wide ? 'min-w-0 flex-1' : 'max-w-feed shrink-0 pb-16'
        )}>
        <Outlet />
      </main>

      {!wide && <RightRail />}

      <BottomBar />

      {/* The rail's Post button is hidden below `sm`, so small screens get a
          floating compose button rather than no way to write at all. */}
      {user && !inConversation && (
        <button
          type="button"
          onClick={() => setComposing(true)}
          aria-label="Write a post"
          className="btn-primary fixed bottom-20 right-4 z-30 h-14 w-14 p-0 shadow-pop sm:hidden">
          <Icon name="feather" className="h-6 w-6" />
        </button>
      )}

      <Modal open={composing} onClose={() => setComposing(false)} title="New post">
        <Composer
          autoFocus
          onPosted={() => {
            setComposing(false);
            toast.success('Posted');
          }}
        />
      </Modal>
    </div>
  );
};

export default AppLayout;
