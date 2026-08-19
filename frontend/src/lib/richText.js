// Splits post text into plain runs, hashtags, mentions and links so each can be
// rendered as the right element. Done at render time rather than stored as
// HTML: the text is escaped by React, so there is no markup to sanitise.
const PATTERN = /(https?:\/\/[^\s]+)|(?:^|(?<=\s))([#@][a-zA-Z0-9_]+)/g;

export const parseRichText = (text = '') => {
  const parts = [];
  let lastIndex = 0;

  for (const match of text.matchAll(PATTERN)) {
    const [full, link, token] = match;
    const start = match.index + (full.length - (link ?? token).length);

    if (start > lastIndex) parts.push({ type: 'text', value: text.slice(lastIndex, start) });

    if (link) {
      parts.push({ type: 'link', value: link });
    } else if (token.startsWith('#')) {
      parts.push({ type: 'hashtag', value: token.slice(1), raw: token });
    } else {
      parts.push({ type: 'mention', value: token.slice(1), raw: token });
    }

    lastIndex = start + (link ?? token).length;
  }

  if (lastIndex < text.length) parts.push({ type: 'text', value: text.slice(lastIndex) });
  return parts;
};
