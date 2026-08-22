import { NavLink, Link } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';
import Avatar from '../ui/Avatar.jsx';
import cn from '../../lib/cn.js';
import { compactCount } from '../../lib/format.js';
import { useAuth } from '../../context/AuthProvider.jsx';
import { useLive } from '../../context/LiveProvider.jsx';
import Logo from '../ui/Logo.jsx';

const Badge = ({ count }) =>
  count > 0 ? (
    // Amber is rationed to exactly this: unread state and live indicators. It
    // is the only saturated colour on the screen, so it always means the same
    // thing.
    <span className="metric absolute -right-1 -top-0.5 min-w-[18px] rounded-full bg-secondary-500 px-1 text-center text-[0.6875rem] font-bold leading-[18px] text-dark-950">
      {compactCount(count)}
    </span>
  ) : null;

const Item = ({ to, icon, label, badge, end }) => (
  <NavLink
    to={to}
    end={end}
    title={label}
    className={({ isActive }) => cn('rail-item group', isActive && 'rail-item-active')}>
    {({ isActive }) => (
      <>
        <span className="relative">
          <Icon name={icon} filled={isActive} className="h-6 w-6" />
          <Badge count={badge} />
        </span>
        <span className="hidden text-[1.0625rem] xl:inline">{label}</span>
      </>
    )}
  </NavLink>
);

const NavRail = ({ onCompose }) => {
  const { user, logout } = useAuth();
  const { notificationCount, messageCount } = useLive();

  return (
    <header className="sticky top-0 hidden h-screen shrink-0 flex-col justify-between px-2 py-3 sm:flex xl:w-64">
      <nav className="flex flex-col gap-1" aria-label="Main">
        <Link to="/" className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-2">
          <Logo className="h-8 w-8" />
          <span className="hidden font-heading text-2xl font-extrabold tracking-tight xl:inline">
            JamiiChat
          </span>
        </Link>

        <Item to="/" icon="home" label="Home" end />
        <Item to="/explore" icon="search" label="Explore" />
        {user && (
          <>
            <Item to="/notifications" icon="bell" label="Notifications" badge={notificationCount} />
            <Item to="/messages" icon="mail" label="Messages" badge={messageCount} />
            <Item to="/people" icon="users" label="People" />
            <Item to="/bookmarks" icon="bookmark" label="Saved" />
            <Item to={`/${user.handle}`} icon="user" label="Profile" />
            <Item to="/settings" icon="settings" label="Settings" />
            {['admin', 'moderator'].includes(user.role) && (
              <Item to="/admin" icon="shield" label="Admin" />
            )}

            <button
              type="button"
              onClick={onCompose}
              title="Write a post"
              className="btn-primary mt-4 w-full py-2.5 shadow-pop xl:py-3">
              <Icon name="feather" className="h-5 w-5 xl:hidden" />
              <span className="hidden xl:inline">Post</span>
            </button>
          </>
        )}
      </nav>

      {user && (
        <div className="flex items-center gap-3 rounded-full p-2 transition hover:bg-sunken xl:pr-3">
          <Avatar user={user} size="sm" link={false} />
          <div className="hidden min-w-0 flex-1 xl:block">
            <p className="truncate text-sm font-bold">{user.displayName}</p>
            <p className="handle truncate">@{user.handle}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Sign out"
            className="rounded-full p-2 text-muted transition hover:bg-sunken hover:text-rose-600 hover:bg-sunken">
            <Icon name="logout" className="h-5 w-5" />
          </button>
        </div>
      )}
    </header>
  );
};

export default NavRail;
