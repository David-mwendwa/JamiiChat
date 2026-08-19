import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout.jsx';
import RequireAuth from './components/layout/RequireAuth.jsx';

import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import HomePage from './pages/HomePage.jsx';
import ExplorePage from './pages/ExplorePage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import TagPage from './pages/TagPage.jsx';
import PostPage from './pages/PostPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import ConnectionsPage from './pages/ConnectionsPage.jsx';
import BookmarksPage from './pages/BookmarksPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import MessagesPage from './pages/MessagesPage.jsx';
import ConversationPage from './pages/ConversationPage.jsx';
import SettingsPage from './pages/account/SettingsPage.jsx';
import AdminPage from './pages/admin/AdminPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

import { useAuth } from './context/AuthProvider.jsx';
import Spinner from './components/ui/Spinner.jsx';

const App = () => {
  const { user, checking } = useAuth();

  // Held until the stored token has been checked. Rendering the routes first
  // would flash the landing page at a signed-in reader on every refresh.
  if (checking)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading JamiiChat" />
      </div>
    );

  return (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />

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
  );
};

export default App;
