import { useState } from 'react';
import Icon from '../ui/Icon.jsx';
import Modal from '../ui/Modal.jsx';
import useClickOutside from '../../hooks/useClickOutside.js';
import { postApi, reportApi } from '../../api/index.js';
import { errorMessage } from '../../api/apiClient.js';
import { useAuth } from '../../context/AuthProvider.jsx';
import { useToast } from '../../context/ToastProvider.jsx';

const REASONS = [
  ['spam', 'Spam or scam'],
  ['harassment', 'Harassment or bullying'],
  ['hate', 'Hate speech'],
  ['violence', 'Violence or threats'],
  ['nudity', 'Nudity or sexual content'],
  ['misinformation', 'False information'],
  ['other', 'Something else'],
];

const PostMenu = ({ post, onDelete }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('spam');
  const [busy, setBusy] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  const owns = user && post.author?.id === user.id;
  const canRemove = owns || ['admin', 'moderator'].includes(user?.role);

  const remove = async () => {
    setBusy(true);
    try {
      await postApi.remove(post.id);
      toast.success('Post deleted');
      onDelete?.(post.id);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete that post'));
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const submitReport = async () => {
    setBusy(true);
    try {
      await reportApi.create({ targetType: 'post', targetId: post.id, reason });
      toast.success('Thanks — a moderator will take a look');
      setReporting(false);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not send that report'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          aria-label="More options"
          aria-expanded={open}
          className="rounded-full p-1.5 text-muted transition hover:bg-sunken hover:text-ink-soft hover:bg-sunken dark:hover:text-dark-200">
          <Icon name="more" className="h-4 w-4" strokeWidth="2.5" />
        </button>

        {open && (
          <div className="surface absolute right-0 top-9 z-20 w-48 animate-slide-down overflow-hidden rounded-xl border shadow-lift">
            {canRemove ? (
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  remove();
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-950/40">
                <Icon name="trash" className="h-4 w-4" />
                Delete post
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  setReporting(true);
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium transition hover:bg-sunken">
                <Icon name="flag" className="h-4 w-4" />
                Report post
              </button>
            )}
          </div>
        )}
      </div>

      <Modal open={reporting} onClose={() => setReporting(false)} title="Report this post">
        <div onClick={(e) => e.stopPropagation()}>
          <p className="mb-4 text-sm text-muted">
            Tell us what is wrong with it. A moderator reviews every report.
          </p>
          <div className="space-y-1">
            {REASONS.map(([value, label]) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-sunken">
                <input
                  type="radio"
                  name="reason"
                  value={value}
                  checked={reason === value}
                  onChange={() => setReason(value)}
                  className="text-primary-600 focus:ring-primary-500"
                />
                {label}
              </label>
            ))}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setReporting(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={busy} onClick={submitReport}>
              {busy ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default PostMenu;
