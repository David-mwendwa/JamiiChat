import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Avatar from '../ui/Avatar.jsx';
import Icon from '../ui/Icon.jsx';
import FollowButton from './FollowButton.jsx';
import useClickOutside from '../../hooks/useClickOutside.js';
import { compactCount, joinedDate, mediaUrl } from '../../lib/format.js';
import { messageApi, userApi } from '../../api/index.js';
import { errorMessage } from '../../api/apiClient.js';
import { useAuth } from '../../context/AuthProvider.jsx';
import { useToast } from '../../context/ToastProvider.jsx';
import { useSocket } from '../../socket/SocketProvider.jsx';

const ProfileHeader = ({ profile, onUpdate }) => {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { onlineUsers, markOnline } = useSocket();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useClickOutside(() => setMenuOpen(false));

  const isSelf = profile.relationship === 'self';
  const online = onlineUsers.has(String(profile.id));

  // A one-time seed from the server's own isOnline() check at fetch time —
  // ORing that flag into `online` on every render instead (the bug this
  // replaced) meant the badge stayed lit long after the person disconnected,
  // since a value that starts true and is never re-checked can only ever
  // stay true. Live presence events take over the instant this seed lands.
  useEffect(() => {
    if (profile.online) markOnline([profile.id]);
  }, [profile.id, profile.online, markOnline]);

  const message = async () => {
    try {
      const { data } = await messageApi.open(profile.handle);
      navigate(`/messages/${data.conversation.id}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not open that conversation'));
    }
  };

  const toggleBlock = async () => {
    try {
      await userApi.block(profile.handle);
      toast.success(`Blocked @${profile.handle}`);
      onUpdate?.();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not block that account'));
    } finally {
      setMenuOpen(false);
    }
  };

  const toggleMute = async () => {
    try {
      if (profile.muted) await userApi.unmute(profile.handle);
      else await userApi.mute(profile.handle);
      toast.success(profile.muted ? `Unmuted @${profile.handle}` : `Muted @${profile.handle}`);
      onUpdate?.();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update that'));
    } finally {
      setMenuOpen(false);
    }
  };

  return (
    <section>
      {/* Cover sits behind the avatar, with a scrim at the bottom so a light
          cover image cannot swallow the avatar ring beneath it. */}
      <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 sm:h-52">
        {profile.cover && (
          <img
            src={mediaUrl(profile.cover)}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-ink/25 to-transparent" />
      </div>

      {/* The avatar overlaps the cover but stays inside the same horizontal
          padding as the body text, so name, bio and picture share one edge. */}
      <div className="px-4">
        <div className="flex items-end justify-between gap-3">
          <div className="-mt-14 rounded-full ring-4 ring-canvas sm:-mt-16">
            <Avatar user={profile} size="xl" link={false} online={online} />
          </div>

          <div className="flex items-center gap-2 pb-1">
            {isSelf ? (
              <Link to="/settings" className="btn-outline font-bold">
                Edit profile
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  onClick={message}
                  aria-label={`Message ${profile.displayName}`}
                  title="Send a message"
                  className="btn-outline p-2.5">
                  <Icon name="mail" className="h-[18px] w-[18px]" />
                </button>

                <div ref={menuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-label="More options"
                    aria-expanded={menuOpen}
                    className="btn-outline p-2.5">
                    <Icon name="more" className="h-[18px] w-[18px]" strokeWidth="2.5" />
                  </button>
                  {menuOpen && (
                    <div className="surface absolute right-0 top-12 z-20 w-52 animate-slide-down overflow-hidden rounded-xl border shadow-lift">
                      <button
                        type="button"
                        onClick={toggleMute}
                        className="w-full px-4 py-2.5 text-left text-sm font-medium transition hover:bg-sunken">
                        {profile.muted ? 'Unmute' : 'Mute'} @{profile.handle}
                      </button>
                      <button
                        type="button"
                        onClick={toggleBlock}
                        className="w-full px-4 py-2.5 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-500/10">
                        Block @{profile.handle}
                      </button>
                    </div>
                  )}
                </div>

                <FollowButton
                  handle={profile.handle}
                  initialState={profile.relationship}
                  onChange={onUpdate}
                />
              </>
            )}
          </div>
        </div>

        <div className="mt-3 pb-4">
          <h1 className="flex flex-wrap items-center gap-2 text-xl leading-tight sm:text-2xl">
            {profile.displayName}
            {profile.isPrivate && (
              <span className="chip gap-1.5" title="This account is private">
                <Icon name="lock" className="h-3 w-3" strokeWidth="2.4" />
                Private
              </span>
            )}
          </h1>
          <p className="handle mt-0.5 text-sm">@{profile.handle}</p>

          {profile.bio && <p className="post-text mt-3 max-w-prose">{profile.bio}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.8125rem] text-muted">
            {profile.location && (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="pin" className="h-3.5 w-3.5" />
                {profile.location}
              </span>
            )}
            {profile.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-primary-600 hover:underline dark:text-primary-400">
                <Icon name="link" className="h-3.5 w-3.5" />
                {profile.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Icon name="calendar" className="h-3.5 w-3.5" />
              Joined {joinedDate(profile.createdAt)}
            </span>
          </div>

          <div className="mt-3.5 flex gap-5 text-sm">
            <Link to={`/${profile.handle}/following`} className="group">
              <span className="metric font-bold text-ink">
                {compactCount(profile.counts.following)}
              </span>{' '}
              <span className="text-muted group-hover:underline">Following</span>
            </Link>
            <Link to={`/${profile.handle}/followers`} className="group">
              <span className="metric font-bold text-ink">
                {compactCount(profile.counts.followers)}
              </span>{' '}
              <span className="text-muted group-hover:underline">Followers</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProfileHeader;
