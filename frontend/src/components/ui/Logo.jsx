// Three linked nodes — a community is the connections, not the people. Drawn
// rather than imported so it inherits currentColor in both themes.
const Logo = ({ className = 'h-8 w-8' }) => (
  <svg viewBox="0 0 32 32" className={className} aria-label="JamiiChat" role="img">
    <circle cx="16" cy="16" r="15" className="fill-primary-600" />
    <g stroke="white" strokeWidth="1.8" strokeLinecap="round">
      <path d="M11 12.5 21 19.5M11 19.5 21 12.5M11 12.5v7" />
    </g>
    <circle cx="11" cy="12.5" r="3" className="fill-white" />
    <circle cx="21" cy="12.5" r="2.6" className="fill-white" />
    <circle cx="11" cy="19.5" r="2.6" className="fill-white" />
    <circle cx="21" cy="19.5" r="3" className="fill-secondary-400" />
  </svg>
);

export default Logo;
