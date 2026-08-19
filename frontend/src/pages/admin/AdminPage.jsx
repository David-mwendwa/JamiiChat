import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import cn from '../../lib/cn.js';
import { compactCount, relativeTime } from '../../lib/format.js';
import { adminApi } from '../../api/index.js';
import { errorMessage } from '../../api/apiClient.js';
import { useToast } from '../../context/ToastProvider.jsx';

const Stat = ({ label, value, tone }) => (
  <div className="rounded-xl border border-line p-3.5 dark:border-line">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
    <p className={cn('metric mt-1 text-2xl font-bold', tone)}>{compactCount(value)}</p>
  </div>
);

const REASON_LABELS = {
  spam: 'Spam or scam',
  harassment: 'Harassment',
  hate: 'Hate speech',
  violence: 'Violence',
  nudity: 'Nudity',
  misinformation: 'False information',
  other: 'Other',
};

const AdminPage = () => {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Which tab and which report filter were open lives in the URL, not local
  // state. Following a link out of this page (a reported post, a reported
  // account) unmounts AdminPage entirely, so plain useState always came back
  // as the default on the way back — clicking into Accounts, opening a
  // profile, and pressing Back landed on Reports instead of where you were.
  // Reading the initial value from the URL on every render means the page
  // reconstructs the same view it had before it was ever unmounted.
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'users' ? 'users' : 'reports';
  const state = ['open', 'actioned', 'dismissed'].includes(params.get('state'))
    ? params.get('state')
    : 'open';

  const setTab = (next) => setParams((prev) => {
    const merged = new URLSearchParams(prev);
    merged.set('tab', next);
    return merged;
  }, { replace: true });

  const setState = (next) => setParams((prev) => {
    const merged = new URLSearchParams(prev);
    merged.set('tab', 'reports');
    merged.set('state', next);
    return merged;
  }, { replace: true });

  const load = async () => {
    setLoading(true);
    try {
      const [overview, reportList, userList] = await Promise.all([
        adminApi.overview(),
        adminApi.reports({ state }),
        adminApi.users({ limit: 30 }),
      ]);
      setStats(overview.data.stats);
      setReports(reportList.data.items);
      setUsers(userList.data.items);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load the admin data'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const resolve = async (id, action) => {
    try {
      await adminApi.resolve(id, { action });
      setReports((prev) => prev.filter((r) => r._id !== id));
      toast.success(action === 'actioned' ? 'Report actioned' : 'Report dismissed');
      const overview = await adminApi.overview();
      setStats(overview.data.stats);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not resolve that report'));
    }
  };

  const toggleActive = async (id, active) => {
    try {
      await adminApi.setActive(id, active);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, active } : u)));
      toast.success(active ? 'Account reactivated' : 'Account deactivated');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update that account'));
    }
  };

  return (
    <>
      <PageHeader title="Admin" subtitle="Moderation and platform health" />

      {loading && !stats ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <>
          {stats && (
            <div className="divider grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
              <Stat label="Accounts" value={stats.users} />
              <Stat label="Posts" value={stats.posts} />
              <Stat
                label="Open reports"
                value={stats.openReports}
                tone={stats.openReports > 0 ? 'text-secondary-600 dark:text-secondary-400' : ''}
              />
              <Stat label="New today" value={stats.newUsers} />
              <Stat label="Posts today" value={stats.newPosts} />
            </div>
          )}

          <div className="divider flex">
            {[
              ['reports', 'Reports'],
              ['users', 'Accounts'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                aria-current={tab === value}
                className="group relative flex-1 py-3 text-sm font-semibold transition hover:bg-sunken">
                <span className={tab === value ? '' : 'text-muted'}>{label}</span>
                {tab === value && (
                  <span className="absolute inset-x-0 bottom-0 mx-auto h-[3px] w-12 rounded-full bg-primary-600" />
                )}
              </button>
            ))}
          </div>

          {tab === 'reports' && (
            <>
              <div className="divider flex gap-2 px-4 py-3">
                {['open', 'actioned', 'dismissed'].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setState(value)}
                    className={cn(
                      'btn px-3 py-1.5 text-[0.8125rem] capitalize',
                      state === value
                        ? 'bg-primary-600 text-white'
                        : 'border border-line-strong'
                    )}>
                    {value}
                  </button>
                ))}
              </div>

              {reports.length === 0 ? (
                <EmptyState
                  title={state === 'open' ? 'Nothing waiting' : `No ${state} reports`}
                  description={
                    state === 'open'
                      ? 'Reports from people using JamiiChat land here for review.'
                      : 'Reports move here once a moderator has decided on them.'
                  }
                />
              ) : (
                <ul>
                  {reports.map((report) => (
                    <li key={report._id} className="divider px-4 py-4">
                      <div className="flex items-start gap-3">
                        <span className="rounded-md bg-secondary-100 px-2 py-1 text-[0.6875rem] font-bold uppercase tracking-wide text-secondary-800 dark:bg-secondary-950/50 dark:text-secondary-300">
                          {REASON_LABELS[report.reason] ?? report.reason}
                        </span>
                        <time className="handle ml-auto">{relativeTime(report.createdAt)}</time>
                      </div>

                      <p className="mt-2 text-sm text-muted">
                        Reported by{' '}
                        <Link to={`/${report.reporter?.handle}`} className="font-semibold hover:underline">
                          @{report.reporter?.handle}
                        </Link>
                      </p>

                      {report.post && (
                        <Link
                          to={`/post/${report.post._id}`}
                          className="mt-2 block rounded-xl border border-line p-3 transition hover:bg-sunken dark:border-line hover:bg-sunken">
                          <div className="flex items-center gap-2">
                            <Avatar user={report.post.author} size="xs" link={false} />
                            <span className="handle">@{report.post.author?.handle}</span>
                          </div>
                          <p className="post-text mt-1.5 line-clamp-3">{report.post.text}</p>
                        </Link>
                      )}

                      {report.user && (
                        <Link
                          to={`/${report.user.handle}`}
                          className="mt-2 flex items-center gap-2 rounded-xl border border-line p-3 transition hover:bg-sunken dark:border-line hover:bg-sunken">
                          <Avatar user={report.user} size="sm" link={false} />
                          <div>
                            <p className="text-sm font-bold">{report.user.displayName}</p>
                            <p className="handle">@{report.user.handle}</p>
                          </div>
                        </Link>
                      )}

                      {report.state === 'open' && (
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => resolve(report._id, 'actioned')}
                            className="btn bg-rose-600 px-3 py-1.5 text-[0.8125rem] text-white hover:bg-rose-700">
                            {report.post ? 'Remove post' : 'Deactivate account'}
                          </button>
                          <button
                            type="button"
                            onClick={() => resolve(report._id, 'dismissed')}
                            className="btn-outline px-3 py-1.5 text-[0.8125rem]">
                            Dismiss
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {tab === 'users' && (
            <ul>
              {users.map((account) => (
                <li key={account.id} className="divider flex items-center gap-3 px-4 py-3">
                  <Avatar user={account} size="sm" />
                  <div className="min-w-0 flex-1">
                    <Link to={`/${account.handle}`} className="block truncate text-sm font-bold hover:underline">
                      {account.displayName}
                    </Link>
                    <p className="handle truncate">
                      @{account.handle} · {account.role}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'rounded-md px-2 py-0.5 text-[0.6875rem] font-bold uppercase',
                      account.active
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                        : 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'
                    )}>
                    {account.active ? 'Active' : 'Off'}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleActive(account.id, !account.active)}
                    className="btn-outline px-3 py-1.5 text-[0.8125rem]">
                    {account.active ? 'Deactivate' : 'Restore'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
};

export default AdminPage;
