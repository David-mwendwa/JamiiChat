import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout.jsx';
import RequireAuth from './components/layout/RequireAuth.jsx';

/*
 * Chunks that have already been fetched, so a prerendered route can render
 * synchronously on its first pass.
 *
 * This exists for one reason. The public routes are written to static HTML at
 * build time, and the browser hydrates that markup rather than rebuilding it.
 * But a `lazy` component is not ready on the first render, so hydration would
 * render the Suspense fallback — an empty div — against a full page of server
 * markup, React would declare a mismatch and re-render the entire route from
 * scratch. That is the whole cost of prerendering with none of the benefit,
 * and it is invisible in production because the end result still looks right.
 *
 * So main.jsx fetches the matching chunk before hydrating and it is stashed
 * here. If it is present the route renders it directly and the server markup
 * is adopted; if not — every client-side navigation — it falls back to the
 * ordinary lazy component and Suspense behaves as usual.
 */
const loaded = new Map();

const route = (key, factory) => {
  const Lazy = lazy(factory);
  const Component = (props) => {
    const Ready = loaded.get(key);
    return Ready ? <Ready {...props} /> : <Lazy {...props} />;
  };
  Component.preload = () =>
    factory().then((mod) => {
      loaded.set(key, mod.default);
      return mod;
    });
  return Component;
};

/*
 * Every page is split out of the entry bundle.
 *
 * These were 20 static imports, which put Messages, the admin moderation
 * queue, Settings and the call stack into the same 470KB file a signed-out
 * reader downloads to look at the landing page. Nobody's first visit needs
 * any of it, and a first visit is the one that decides whether there is a
 * second.
 *
 * Splitting is safe for the prerender because scripts/prerender.mjs renders
 * through renderToPipeableStream with `onAllReady`, which waits for suspended
 * boundaries. renderToString does not, and would emit the Suspense fallback as
 * the static HTML for every route — a spinner is exactly what a crawler must
 * not be served. If the prerendered files ever come out as a spinner, this is
 * the first place to look.
 */
const LandingPage = route('landing', () => import('./pages/LandingPage.jsx'));
const LoginPage = route('login', () => import('./pages/LoginPage.jsx'));
const RegisterPage = route('register', () => import('./pages/RegisterPage.jsx'));
const ForgotPasswordPage = route('forgot', () => import('./pages/ForgotPasswordPage.jsx'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.jsx'));
const HomePage = lazy(() => import('./pages/HomePage.jsx'));
const ExplorePage = lazy(() => import('./pages/ExplorePage.jsx'));
const SearchPage = lazy(() => import('./pages/SearchPage.jsx'));
const TagPage = lazy(() => import('./pages/TagPage.jsx'));
const PostPage = lazy(() => import('./pages/PostPage.jsx'));
const ProfilePage = lazy(() => import('./pages/ProfilePage.jsx'));
const ConnectionsPage = lazy(() => import('./pages/ConnectionsPage.jsx'));
const PeoplePage = lazy(() => import('./pages/PeoplePage.jsx'));
const BookmarksPage = lazy(() => import('./pages/BookmarksPage.jsx'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage.jsx'));
const MessagesPage = lazy(() => import('./pages/MessagesPage.jsx'));
const ConversationPage = lazy(() => import('./pages/ConversationPage.jsx'));
const SettingsPage = lazy(() => import('./pages/account/SettingsPage.jsx'));
const AdminPage = lazy(() => import('./pages/admin/AdminPage.jsx'));
const NotFoundPage = route('notfound', () => import('./pages/NotFoundPage.jsx'));

import { useAuth } from './context/AuthProvider.jsx';
import Spinner from './components/ui/Spinner.jsx';

/*
 * Deliberately not a full-screen spinner.
 *
 * This shows while a route's chunk is in flight, which on a warm cache is a
 * single frame. A centred spinner sized to the viewport made every navigation
 * flash the whole shell — nav rail included — to blank and back. Holding the
 * column open with nothing in it reads as the page arriving rather than the
 * app restarting.
 */
const RouteFallback = () => (
  <div className="min-h-[60vh]" aria-hidden="true" />
);

const App = () => {
  const { user, checking } = useAuth();

  // Held only when there is no cached session to render from — AuthProvider
  // hydrates the last-known user synchronously and revalidates in the
  // background, so this is the genuine cold case (a token but no cached user)
  // rather than every refresh.
  if (checking)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading JamiiChat" />
      </div>
    );

  return (
  <Suspense fallback={<RouteFallback />}>
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/password/forgot" element={<ForgotPasswordPage />} />
    <Route path="/password/reset/:token" element={<ResetPasswordPage />} />

    {/* Signed out, "/" is a full-width landing page that sits outside the app
        shell — rendering it inside the 620px feed column squeezed the hero and
        wrapped its buttons onto two lines. Signed in, "/" is the home feed. */}
    {!user && <Route path="/" element={<LandingPage />} />}

    <Route element={<AppLayout />}>
      {user && <Route index element={<HomePage />} />}
      <Route path="explore" element={<ExplorePage />} />
      <Route path="search" element={<SearchPage />} />
      <Route path="tag/:tag" element={<TagPage />} />
      <Route path="post/:id" element={<PostPage />} />

      <Route
        path="notifications"
        element={
          <RequireAuth>
            <NotificationsPage />
          </RequireAuth>
        }
      />
      <Route
        path="bookmarks"
        element={
          <RequireAuth>
            <BookmarksPage />
          </RequireAuth>
        }
      />
      <Route
        path="people"
        element={
          <RequireAuth>
            <PeoplePage />
          </RequireAuth>
        }
      />
      <Route
        path="settings"
        element={
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        }
      />
      <Route
        path="admin"
        element={
          <RequireAuth roles={['admin', 'moderator']}>
            <AdminPage />
          </RequireAuth>
        }
      />

      <Route
        path="messages"
        element={
          <RequireAuth>
            <MessagesPage />
          </RequireAuth>
        }>
        <Route path=":id" element={<ConversationPage />} />
      </Route>

      {/* Declared last: a bare path is a username, so every fixed route above
          has to be matched first. */}
      <Route path=":handle" element={<ProfilePage />} />
      <Route path=":handle/followers" element={<ConnectionsPage mode="followers" />} />
      <Route path=":handle/following" element={<ConnectionsPage mode="following" />} />
    </Route>

    <Route path="/404" element={<NotFoundPage />} />
    <Route path="*" element={<Navigate to="/404" replace />} />
  </Routes>
  </Suspense>
  );
};

export default App;

/**
 * Which chunk a prerendered path needs, awaited before hydration.
 *
 * Only the routes scripts/prerender.mjs writes to static HTML are here —
 * they are the only ones that ever hydrate against existing markup. Every
 * other path is served the empty SPA shell, where main.jsx mounts with
 * createRoot and Suspense is the correct behaviour.
 *
 * Kept as a plain path→key map rather than reusing the router: this runs
 * before React exists, and a second matcher that has to agree with the router
 * is worth less than one that cannot disagree with the four literal strings
 * the build actually wrote.
 */
const PRELOADERS = {
  '/': LandingPage,
  '/login': LoginPage,
  '/register': RegisterPage,
  '/password/forgot': ForgotPasswordPage,
  '/404': NotFoundPage,
};

export const preloadRoute = (pathname) => {
  // A trailing slash is the same route; Netlify serves both.
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  const component = PRELOADERS[path];
  return component ? component.preload() : Promise.resolve();
};
