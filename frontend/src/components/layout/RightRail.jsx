import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Avatar from '../ui/Avatar.jsx';
import Icon from '../ui/Icon.jsx';
import { searchApi, userApi } from '../../api/index.js';
import { compactCount } from '../../lib/format.js';
import { useAuth } from '../../context/AuthProvider.jsx';
import FollowButton from '../profile/FollowButton.jsx';
import ConnectionStatus from './ConnectionStatus.jsx';

const RightRail = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [trending, setTrending] = useState([]);
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    searchApi
      .trending({ limit: 6 })
      .then(({ data }) => setTrending(data.items))
      .catch(() => setTrending([]));
  }, []);

  useEffect(() => {
    if (!user) return;
    userApi
      .suggestions({ limit: 3 })
      .then(({ data }) => setSuggestions(data.items))
      .catch(() => setSuggestions([]));
  }, [user]);

  const submit = (event) => {
    event.preventDefault();
    if (query.trim().length >= 2) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <aside className="sticky top-0 hidden h-screen w-[350px] shrink-0 overflow-y-auto px-6 py-3 lg:block">
      <form onSubmit={submit} role="search" className="sticky top-0 z-10 bg-white pb-3 pt-1 dark:bg-dark-950">
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search JamiiChat"
            aria-label="Search JamiiChat"
            className="field rounded-full bg-sunken pl-10 dark:bg-dark-900"
          />
        </div>
      </form>

      <ConnectionStatus />

      {trending.length > 0 && (
        <section className="mt-3 rounded-2xl bg-sunken p-4 dark:bg-dark-900">
          <h2 className="mb-3 text-lg">Trending now</h2>
          <ul className="space-y-2.5">
            {trending.map((item) => (
              <li key={item.tag}>
                <Link to={`/tag/${item.tag}`} className="group block">
                  <p className="font-heading font-bold group-hover:underline">#{item.tag}</p>
                  <p className="metric text-xs text-muted">
                    {compactCount(item.posts)} {item.posts === 1 ? 'post' : 'posts'}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {suggestions.length > 0 && (
        <section className="mt-4 rounded-2xl bg-sunken p-4 dark:bg-dark-900">
          <h2 className="mb-3 text-lg">Who to follow</h2>
          <ul className="space-y-3">
            {suggestions.map((person) => (
              <li key={person.id} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-sunken">
                <Avatar user={person} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link to={`/${person.handle}`} className="block truncate text-sm font-bold hover:underline">
                    {person.displayName}
                  </Link>
                  <p className="handle truncate">@{person.handle}</p>
                </div>
                <FollowButton
                  handle={person.handle}
                  initialState="none"
                  size="sm"
                  onChange={() =>
                    setSuggestions((prev) => prev.filter((p) => p.id !== person.id))
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-6 text-xs text-muted">
        <Link to="/explore" className="hover:underline">Explore</Link>
        <Link to="/search" className="hover:underline">Search</Link>
        <Link to="/settings" className="hover:underline">Settings</Link>
        <span className="w-full pt-1">JamiiChat — a place for community.</span>
        <span className="flex w-full items-center gap-1 pt-1">
          Developed by
          <a
            href="https://techdave.netlify.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-semibold text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300">
            David
            <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M7 17L17 7M17 7H7M17 7V17" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </span>
      </footer>
    </aside>
  );
};

export default RightRail;
