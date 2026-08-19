import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import Icon from '../../components/ui/Icon.jsx';
import cn from '../../lib/cn.js';
import { userApi, authApi } from '../../api/index.js';
import { errorMessage } from '../../api/apiClient.js';
import { useAuth } from '../../context/AuthProvider.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useTheme, FONT_SCALES } from '../../context/ThemeProvider.jsx';

const Section = ({ title, description, children }) => (
  <section className="divider px-4 py-5">
    <h2 className="text-[0.9375rem]">{title}</h2>
    {description && (
      <p className="mt-0.5 text-sm text-muted">{description}</p>
    )}
    <div className="mt-4 space-y-4">{children}</div>
  </section>
);

const SettingsPage = () => {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const { theme, setTheme, fontScale, setFontScale } = useTheme();
  const avatarInput = useRef(null);
  const coverInput = useRef(null);

  const [profile, setProfile] = useState({ displayName: '', bio: '', location: '', website: '' });
  const [isPrivate, setIsPrivate] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [requests, setRequests] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setProfile({
      displayName: user.displayName ?? '',
      bio: user.bio ?? '',
      location: user.location ?? '',
      website: user.website ?? '',
    });
    setIsPrivate(Boolean(user.isPrivate));
  }, [user]);

  const loadLists = () => {
    userApi.requests().then(({ data }) => setRequests(data.items)).catch(() => {});
    userApi.blocked().then(({ data }) => setBlocked(data.items)).catch(() => {});
  };

  useEffect(loadLists, []);

  const saveProfile = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { data } = await userApi.updateMe({ ...profile, isPrivate });
      setUser(data.user);
      toast.success('Profile saved');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save your profile'));
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async (kind, file) => {
    if (!file) return;
    const form = new FormData();
    form.append('image', file);
    try {
      const { data } = await userApi.uploadImage(kind, form);
      setUser(data.user);
      toast.success(kind === 'avatar' ? 'Photo updated' : 'Cover updated');
    } catch (err) {
      toast.error(errorMessage(err, 'That image did not upload'));
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await authApi.updatePassword(passwords);
      setPasswords({ currentPassword: '', newPassword: '' });
      toast.success('Password changed');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not change your password'));
    } finally {
      setBusy(false);
    }
  };

  const respond = async (handle, accept) => {
    try {
      await userApi.respond(handle, accept);
      setRequests((prev) => prev.filter((r) => r.handle !== handle));
      toast.success(accept ? `@${handle} can now see your posts` : 'Request declined');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not respond to that request'));
    }
  };

  const unblock = async (handle) => {
    try {
      await userApi.unblock(handle);
      setBlocked((prev) => prev.filter((b) => b.handle !== handle));
      toast.success(`Unblocked @${handle}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not unblock that account'));
    }
  };

  if (!user) return null;

  return (
    <>
      <PageHeader title="Settings" back />

      <Section title="Photos" description="Your picture and cover show on your profile.">
        <div className="flex items-center gap-4">
          <Avatar user={user} size="lg" link={false} />
          <div className="flex gap-2">
            <button type="button" className="btn-outline text-[0.8125rem]" onClick={() => avatarInput.current?.click()}>
              Change photo
            </button>
            <button type="button" className="btn-outline text-[0.8125rem]" onClick={() => coverInput.current?.click()}>
              Change cover
            </button>
          </div>
          <input
            ref={avatarInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              uploadImage('avatar', e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <input
            ref={coverInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              uploadImage('cover', e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </Section>

      <Section title="Profile">
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label htmlFor="displayName" className="mb-1.5 block text-sm font-semibold">Name</label>
            <input
              id="displayName"
              value={profile.displayName}
              onChange={(e) => setProfile((p) => ({ ...p, displayName: e.target.value }))}
              maxLength={50}
              className="field"
            />
          </div>

          <div>
            <label htmlFor="bio" className="mb-1.5 block text-sm font-semibold">Bio</label>
            <textarea
              id="bio"
              value={profile.bio}
              onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
              maxLength={160}
              rows={3}
              className="field resize-none"
            />
            <p className="mt-1 text-right text-xs text-muted">
              <span className="metric">{160 - profile.bio.length}</span> characters left
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="location" className="mb-1.5 block text-sm font-semibold">Location</label>
              <input
                id="location"
                value={profile.location}
                onChange={(e) => setProfile((p) => ({ ...p, location: e.target.value }))}
                maxLength={40}
                className="field"
              />
            </div>
            <div>
              <label htmlFor="website" className="mb-1.5 block text-sm font-semibold">Website</label>
              <input
                id="website"
                value={profile.website}
                onChange={(e) => setProfile((p) => ({ ...p, website: e.target.value }))}
                className="field"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-sunken p-3.5 dark:bg-dark-900">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="mt-0.5 rounded text-primary-600 focus:ring-primary-500"
            />
            <span>
              <span className="block text-sm font-semibold">Private account</span>
              <span className="block text-sm text-muted">
                New followers have to be approved by you before they can see your posts.
              </span>
            </span>
          </label>

          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </Section>

      {requests.length > 0 && (
        <Section title="Follow requests" description="These people want to see your posts.">
          <ul className="space-y-3">
            {requests.map((person) => (
              <li key={person.id} className="flex items-center gap-3">
                <Avatar user={person} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link to={`/${person.handle}`} className="block truncate text-sm font-bold hover:underline">
                    {person.displayName}
                  </Link>
                  <p className="handle truncate">@{person.handle}</p>
                </div>
                <button type="button" className="btn-primary px-3 py-1.5 text-[0.8125rem]" onClick={() => respond(person.handle, true)}>
                  Accept
                </button>
                <button type="button" className="btn-outline px-3 py-1.5 text-[0.8125rem]" onClick={() => respond(person.handle, false)}>
                  Decline
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Appearance" description="Choose how JamiiChat looks on this device.">
        {/* A compact segmented control, not three stacked blocks. Picking a
            theme is a one-line preference and should not occupy more of the
            page than the profile form above it. */}
        <div
          role="radiogroup"
          aria-label="Theme"
          className="inline-flex rounded-full border border-line bg-sunken p-1">
          {[
            ['light', 'Light', 'sun'],
            ['dark', 'Dark', 'moon'],
            ['system', 'System', 'settings'],
          ].map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => setTheme(value)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold transition',
                theme === value
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-muted hover:text-ink'
              )}>
              <Icon name={icon} className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Sizes the root, which every rem in the app is relative to — so type
            and spacing scale together rather than leaving text floating inside
            fixed boxes. The steps are percentages of whatever the reader's
            browser is already set to, so this stacks with an OS text-size
            setting instead of overriding it. */}
        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold">Text size</p>
          <div
            role="radiogroup"
            aria-label="Text size"
            className="inline-flex items-center gap-1 rounded-full border border-line bg-sunken p-1">
            <span aria-hidden="true" className="pl-2 pr-1 text-[0.75rem] text-muted">A</span>
            {Object.entries(FONT_SCALES).map(([value, { label }]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={fontScale === value}
                onClick={() => setFontScale(value)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-[0.8125rem] font-semibold transition',
                  fontScale === value
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-muted hover:text-ink'
                )}>
                {label}
              </button>
            ))}
            <span aria-hidden="true" className="pl-1 pr-2 text-[1.125rem] text-muted">A</span>
          </div>
          <p className="mt-2 text-xs text-muted">
            Applies to this device. Your browser or system text size still
            applies on top of this.
          </p>
        </div>
      </Section>

      {blocked.length > 0 && (
        <Section title="Blocked accounts" description="They cannot see you and you cannot see them.">
          <ul className="space-y-3">
            {blocked.map((person) => (
              <li key={person.id} className="flex items-center gap-3">
                <Avatar user={person} size="sm" link={false} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{person.displayName}</p>
                  <p className="handle truncate">@{person.handle}</p>
                </div>
                <button type="button" className="btn-outline px-3 py-1.5 text-[0.8125rem]" onClick={() => unblock(person.handle)}>
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Password">
        <form onSubmit={changePassword} className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className="mb-1.5 block text-sm font-semibold">Current password</label>
            <input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={passwords.currentPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="newPassword" className="mb-1.5 block text-sm font-semibold">New password</label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={passwords.newPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
              className="field"
            />
          </div>
          <button type="submit" disabled={busy} className="btn-outline">
            Change password
          </button>
        </form>
      </Section>

      <Section title="Session">
        <button type="button" onClick={logout} className="btn-outline text-rose-600 dark:text-rose-400">
          <Icon name="logout" className="h-4 w-4" />
          Sign out
        </button>
      </Section>
    </>
  );
};

export default SettingsPage;
