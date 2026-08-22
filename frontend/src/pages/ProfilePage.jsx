import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader.jsx';
import ProfileHeader from '../components/profile/ProfileHeader.jsx';
import FeedList from '../components/feed/FeedList.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import PostSkeleton from '../components/ui/PostSkeleton.jsx';
import Icon from '../components/ui/Icon.jsx';
import useInfiniteFeed from '../hooks/useInfiniteFeed.js';
import { useAuth } from '../context/AuthProvider.jsx';
import { userApi } from '../api/index.js';
import { compactCount } from '../lib/format.js';

const ProfilePage = () => {
  const { handle } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOwn = user?.handle === handle;
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState('loading');
  const [tab, setTab] = useState('posts');

  const loadProfile = useCallback(async () => {
    try {
      const { data } = await userApi.profile(handle);
      setProfile(data.user);
      setStatus('ready');
    } catch {
      setStatus('missing');
    }
  }, [handle]);

  useEffect(() => {
    setStatus('loading');
    setTab('posts');
    loadProfile();
  }, [loadProfile]);

  const fetcher = useCallback(
    async (cursor) => {
      const { data } = await userApi.posts(handle, tab, { cursor, limit: 20 });
      return { items: data.items, nextCursor: data.nextCursor, locked: data.locked };
    },
    [handle, tab]
  );

  const feed = useInfiniteFeed(fetcher, [handle, tab], `feed:profile:${handle}:${tab}`);

  if (status === 'loading')
    return (
      <>
        <PageHeader title="Profile" back />
        <div className="h-36 skeleton sm:h-48" />
        <PostSkeleton />
      </>
    );

  if (status === 'missing')
    return (
      <>
        <PageHeader title="Profile" back />
        <EmptyState
          title="This account does not exist"
          description="The username may have changed, or the account may have been removed."
          action={
            <button type="button" className="btn-primary" onClick={() => navigate('/')}>
              Back home
            </button>
          }
        />
      </>
    );

  const locked = profile.canViewPosts === false;

  return (
    <>
      <PageHeader
        title={profile.displayName}
        subtitle={`${compactCount(profile.counts.posts)} posts`}
        back
        actions={
          isOwn && (
            // Settings and Saved live in the nav rail on desktop; the bottom
            // bar's five slots are already spoken for, so a phone's only way
            // in is here, on the one screen that's unambiguously "you".
            <div className="-mr-2 flex items-center sm:hidden">
              <Link
                to="/bookmarks"
                aria-label="Saved posts"
                title="Saved"
                className="rounded-full p-2 transition hover:bg-sunken">
                <Icon name="bookmark" className="h-5 w-5" />
              </Link>
              <Link
                to="/settings"
                aria-label="Settings"
                title="Settings"
                className="rounded-full p-2 transition hover:bg-sunken">
                <Icon name="settings" className="h-5 w-5" />
              </Link>
            </div>
          )
        }
      />

      <ProfileHeader profile={profile} onUpdate={loadProfile} />

      {locked ? (
        <EmptyState
          title="These posts are private"
          description={`Follow @${profile.handle} to see what they post. They approve followers themselves.`}
        />
      ) : (
        <>
          <div className="divider flex">
            {[
              ['posts', 'Posts'],
              ['replies', 'Replies'],
              ['reposts', 'Reposts'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                aria-current={tab === value}
                className="group relative flex-1 py-3.5 text-[0.9375rem] font-semibold transition hover:bg-sunken">
                <span className={tab === value ? '' : 'text-muted'}>
                  {label}
                </span>
                {tab === value && (
                  <span className="absolute inset-x-0 bottom-0 mx-auto h-[3px] w-16 rounded-full bg-primary-600" />
                )}
              </button>
            ))}
          </div>

          <FeedList
            feed={feed}
            onReply={(post) => navigate(`/post/${post.id}`)}
            empty={
              <EmptyState
                title={
                  tab === 'replies'
                    ? `@${profile.handle} has not replied to anyone yet`
                    : tab === 'reposts'
                      ? `@${profile.handle} has not reposted anything yet`
                      : `@${profile.handle} has not posted yet`
                }
                description={
                  tab === 'replies'
                    ? 'Replies to other posts show up here.'
                    : tab === 'reposts'
                      ? 'Posts they repost show up here.'
                      : 'When they do, their posts show up here.'
                }
              />
            }
          />
        </>
      )}
    </>
  );
};

export default ProfilePage;
