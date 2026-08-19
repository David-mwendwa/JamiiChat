import cn from '../../lib/cn.js';
import { mediaUrl } from '../../lib/format.js';

// Grid shape follows the count, the way every image-carrying feed does it —
// one fills, two split, three make a feature plus a stack, four make a quad.
const LAYOUTS = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2',
  4: 'grid-cols-2',
};

const PostMedia = ({ media = [] }) => {
  if (media.length === 0) return null;

  return (
    <div
      className={cn(
        'mt-3 grid gap-0.5 overflow-hidden rounded-2xl border border-line',
        LAYOUTS[Math.min(media.length, 4)]
      )}>
      {media.slice(0, 4).map((image, i) => (
        <img
          key={image.url}
          src={mediaUrl(image.url)}
          alt={image.alt || ''}
          loading="lazy"
          className={cn(
            'w-full object-cover',
            // A single image is capped well below the fold: a 1200x750 photo at
            // full column width otherwise runs past 480px and pushes every
            // other post out of view.
            media.length === 1 ? 'max-h-[22rem]' : 'h-44 sm:h-52',
            media.length === 3 && i === 0 && 'row-span-2 h-full'
          )}
        />
      ))}
    </div>
  );
};

export default PostMedia;
