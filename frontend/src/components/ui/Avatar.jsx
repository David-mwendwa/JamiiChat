import { Link } from 'react-router-dom';
import cn from '../../lib/cn.js';
import { avatarGradient, initials, mediaUrl } from '../../lib/format.js';

const SIZES = {
  xs: 'h-7 w-7 text-[0.625rem]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-lg',
  xl: 'h-[7.5rem] w-[7.5rem] text-4xl',
};

const DOT = {
  xs: 'h-2 w-2 border',
  sm: 'h-2.5 w-2.5 border-2',
  md: 'h-3 w-3 border-2',
  lg: 'h-3.5 w-3.5 border-2',
  xl: 'h-6 w-6 border-4',
};

const Avatar = ({ user, size = 'md', link = true, online = false, className }) => {
  if (!user) return null;

  const body = (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {user.avatar ? (
        <img
          src={mediaUrl(user.avatar)}
          alt={user.displayName}
          className={cn(SIZES[size], 'rounded-full object-cover ring-1 ring-ink/5')}
          loading="lazy"
        />
      ) : (
        <span
          aria-hidden="true"
          style={{ backgroundImage: avatarGradient(user.handle) }}
          className={cn(
            SIZES[size],
            'inline-flex items-center justify-center rounded-full bg-cover font-heading font-bold text-white ring-1 ring-ink/5'
          )}>
          {initials(user.displayName || user.handle)}
        </span>
      )}
      {online && (
        <span
          className={cn(
            DOT[size],
            'absolute bottom-0 right-0 rounded-full border-canvas bg-emerald-500'
          )}
          title="Online"
        />
      )}
    </span>
  );

  if (!link) return body;

  return (
    <Link
      to={`/${user.handle}`}
      onClick={(e) => e.stopPropagation()}
      aria-label={user.displayName}
      className="rounded-full transition hover:opacity-90">
      {body}
    </Link>
  );
};

export default Avatar;
