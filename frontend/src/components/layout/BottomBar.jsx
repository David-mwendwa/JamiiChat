import { NavLink, Link } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';
import cn from '../../lib/cn.js';
import { useAuth } from '../../context/AuthProvider.jsx';
import { useLive } from '../../context/LiveProvider.jsx';

const Dot = ({ show }) =>
  show ? (
    <span className="absolute right-1 top-0.5 h-2 w-2 rounded-full bg-secondary-500" />
  ) : null;

const Tab = ({ to, icon, label, badge, end }) => (
  <NavLink
    to={to}
    end={end}
    aria-label={label}
    className="relative flex flex-1 items-center justify-center">
    {({ isActive }) => (
      <span className={cn('relative', isActive ? 'text-primary-600 dark:text-primary-400' : 'text-muted')}>
        <Icon name={icon} filled={isActive} className="h-6 w-6" />
        <Dot show={badge > 0} />
      </span>
    )}
  </NavLink>
);

// The rail collapses to this below the `sm` breakpoint. People used to be
// reachable only from a small icon tucked in Explore's header — real but
// easy to never notice. Six evenly-spaced icons is still comfortably
// thumb-reachable on any phone this app targets, so it moved here instead.
const BottomBar = () => {
  const { user } = useAuth();
  const { notificationCount, messageCount } = useLive();

  // Signed out, this used to render nothing at all — and since the desktop
  // rail is hidden below `sm`, that left a signed-out visitor on a phone with
  // no navigation whatsoever: no way to reach the home page, no way to reach
  // sign-in, nothing but the feed they happened to land on. They get the two
  // public destinations plus a sign-in call to action instead.
  if (!user)
    return (
      <nav
        className="surface fixed inset-x-0 bottom-0 z-30 flex h-[var(--bottombar-h)] items-center gap-2 border-t px-3 sm:hidden"
        aria-label="Primary">
        <Tab to="/" icon="home" label="Home" end />
        <Tab to="/explore" icon="search" label="Explore" />
        <Link to="/login" className="btn-primary flex-1 py-2 text-center text-sm">
          Sign in
        </Link>
      </nav>
    );

  return (
    // Labelled "Primary" rather than "Main": the desktop rail already claims
    // "Main", and it stays in the DOM (just hidden) below `sm`, so two nav
    // landmarks sharing one name left a screen reader unable to tell them
    // apart.
    <nav
      className="surface fixed inset-x-0 bottom-0 z-30 flex h-[var(--bottombar-h)] border-t sm:hidden"
      aria-label="Primary">
      <Tab to="/" icon="home" label="Home" end />
      <Tab to="/explore" icon="search" label="Explore" />
      <Tab to="/notifications" icon="bell" label="Notifications" badge={notificationCount} />
      <Tab to="/messages" icon="mail" label="Messages" badge={messageCount} />
      <Tab to="/people" icon="users" label="People" />
      <Tab to={`/${user.handle}`} icon="user" label="Profile" />
    </nav>
  );
};

export default BottomBar;
