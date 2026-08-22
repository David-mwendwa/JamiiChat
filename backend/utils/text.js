// Hashtags and mentions are extracted once on write and stored as arrays, so
// the tag feed is an index lookup rather than a regex scan of every post.

const HASHTAG_RE = /(?:^|\s)#([a-zA-Z][a-zA-Z0-9_]{0,29})/g;
const MENTION_RE = /(?:^|\s)@([a-z0-9_]{3,20})/gi;

export const extractHashtags = (text = '') => {
  const found = new Set();
  for (const match of text.matchAll(HASHTAG_RE)) found.add(match[1].toLowerCase());
  return [...found].slice(0, 10);
};

export const extractHandles = (text = '') => {
  const found = new Set();
  for (const match of text.matchAll(MENTION_RE)) found.add(match[1].toLowerCase());
  return [...found].slice(0, 10);
};

export const preview = (text = '', length = 80) =>
  text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`;

// Escapes a user-supplied string before it reaches a RegExp — an unescaped
// query like `a{1,99999}` is a denial of service, not a search.
export const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
