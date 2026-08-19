// Relative time, tuned for a feed: what matters is "how long ago", and the
// exact date only starts mattering after about a week.
export const relativeTime = (input) => {
  const date = new Date(input);
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);

  if (seconds < 45) return 'now';
  if (seconds < 90) return '1m';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;

  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
};

export const fullDate = (input) =>
  new Date(input).toLocaleString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export const joinedDate = (input) =>
  new Date(input).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

// Counts are shown compactly past a thousand — a feed has no room for "1,247"
// under every post.
export const compactCount = (n = 0) => {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k < 10 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)}K`;
  }
  const m = n / 1_000_000;
  return `${m < 10 ? m.toFixed(1).replace(/\.0$/, '') : Math.round(m)}M`;
};

const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:5007/api/v1').replace(
  /\/api\/v1\/?$/,
  ''
);

// Uploads are served by the API on its own origin, so a stored path has to be
// resolved against that rather than the frontend's.
export const mediaUrl = (path) => {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return `${API_ORIGIN}${path}`;
};

// The same curated hue wheel backend/scripts/generateImages.js uses to draw
// the seed's avatar and cover artwork. Kept in sync deliberately: an account
// that signs up and never uploads a photo gets its fallback generated here,
// client-side, and it needs to read as a sibling of the pre-rendered seed
// avatars rather than a visually different fallback bolted on beside them.
// Skips the muddy 60–95° band the same way the backend list does.
const HUE_WHEEL = [258, 275, 292, 316, 340, 355, 12, 26, 38, 168, 186, 200, 214, 232];

const hashHandle = (value = '') => {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) % 100000;
  return h;
};

const hueFor = (seed) => HUE_WHEEL[seed % HUE_WHEEL.length];

// Picked from the same wheel by a fixed step rather than an arithmetic offset
// from the primary hue — offsetting by a fixed number of degrees walked back
// into the band the wheel exists to avoid (see the backend generator's own
// note on this exact bug).
const pairHueFor = (seed) => HUE_WHEEL[(seed % HUE_WHEEL.length + 4) % HUE_WHEEL.length];

// A duotone field with a few soft colour blobs behind the initials — the same
// motif the seed's generated avatars use, reproduced as a CSS background
// rather than a rasterised image. Cheap enough to compute for every avatar on
// a page: a followers list or a search result page can render dozens at once,
// and this is a handful of arithmetic operations, not a fetch.
export const avatarGradient = (handle = '') => {
  const seed = hashHandle(handle);
  const h = hueFor(seed);
  const h2 = pairHueFor(seed);

  const blob = (i) => {
    const angle = ((seed >> (i * 3)) % 360) * (Math.PI / 180);
    const spread = 22 + ((seed >> (i + 1)) % 14);
    const x = 50 + Math.cos(angle) * spread;
    const y = 50 + Math.sin(angle) * spread;
    const hue = (h2 + i * 16) % 360;
    return `radial-gradient(circle at ${x.toFixed(0)}% ${y.toFixed(0)}%, hsl(${hue} 85% 62% / 0.55), transparent 60%)`;
  };

  return [blob(0), blob(1), blob(2), `linear-gradient(135deg, hsl(${h} 72% 52%), hsl(${h2} 68% 38%))`].join(
    ', '
  );
};

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
