import { Link } from 'react-router-dom';
import { parseRichText } from '../../lib/richText.js';

// Renders hashtags, mentions and links as real elements. The text itself is
// escaped by React, so nothing here needs sanitising.
const RichText = ({ text }) => {
  const parts = parseRichText(text);

  return (
    <p className="post-text">
      {parts.map((part, i) => {
        if (part.type === 'hashtag')
          return (
            <Link
              key={i}
              to={`/tag/${part.value.toLowerCase()}`}
              onClick={(e) => e.stopPropagation()}
              className="text-primary-600 hover:underline dark:text-primary-400">
              {part.raw}
            </Link>
          );

        if (part.type === 'mention')
          return (
            <Link
              key={i}
              to={`/${part.value.toLowerCase()}`}
              onClick={(e) => e.stopPropagation()}
              className="text-primary-600 hover:underline dark:text-primary-400">
              {part.raw}
            </Link>
          );

        if (part.type === 'link')
          return (
            <a
              key={i}
              href={part.value}
              target="_blank"
              // noreferrer alongside noopener: the target page should not learn
              // where its traffic came from either.
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-primary-600 hover:underline dark:text-primary-400">
              {part.value.replace(/^https?:\/\//, '')}
            </a>
          );

        return <span key={i}>{part.value}</span>;
      })}
    </p>
  );
};

export default RichText;
