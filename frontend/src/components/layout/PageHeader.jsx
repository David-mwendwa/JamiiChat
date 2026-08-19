import { useNavigate } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';
import cn from '../../lib/cn.js';

// Sticky and translucent so the feed scrolls under it — the header is a place
// marker, not a wall.
const PageHeader = ({ title, subtitle, back = false, actions }) => {
  const navigate = useNavigate();

  return (
    // Pinned to exactly `--header-h` when there is no subtitle, so anything
    // sticking below it (HomePage's tab strip) can use the same variable as
    // its offset and sit flush. A subtitle needs the extra line, and no screen
    // that has one also stacks a second sticky bar underneath.
    <header
      className={cn(
        'divider glass sticky top-0 z-20 flex items-center gap-4 px-4',
        subtitle ? 'py-2.5' : 'h-[var(--header-h)]'
      )}>
      {back && (
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="-ml-2 rounded-full p-2 transition hover:bg-sunken">
          <Icon name="back" className="h-5 w-5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[1.0625rem] leading-tight sm:text-[1.1875rem]">{title}</h1>
        {subtitle && (
          <p className="metric truncate text-[0.8125rem] text-muted">{subtitle}</p>
        )}
      </div>
      {actions}
    </header>
  );
};

export default PageHeader;
