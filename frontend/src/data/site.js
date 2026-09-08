/**
 * Single source of truth for the site's public identity.
 *
 * Anything that appears in more than one place belongs here. The canonical
 * URL, every og:/twitter: tag, the JSON-LD block and the sitemap are all built
 * from `url` at prerender time, so there is one value to change if the domain
 * ever moves.
 *
 * `url` must name the origin that actually serves production, with no trailing
 * slash. A Netlify deploy preview builds with its own hostname; pointing
 * canonical at the preview tells search engines the preview is the real page.
 * That is why this is a constant rather than something read from the build
 * environment — and why scripts/prerender-meta.mjs allows SITE_URL to override
 * it only for a deliberate build against a different origin.
 *
 * This value and the defaults hardcoded in index.html must move together: the
 * shell's tags are what anyone reading view-source sees, and the prerender only
 * rewrites tags the built pages already carry.
 */
export const site = {
  name: 'JamiiChat',
  url: 'https://jamiichat.netlify.app',
  tagline: 'Post, follow and talk in real time',
  description:
    'JamiiChat is a social platform built for live conversation: posts and threaded replies, a following feed, and direct messages that arrive as they are typed, with read receipts and presence.',
  /** Short form for og:/twitter: descriptions, which get truncated in unfurls. */
  shortDescription:
    'A social platform built for live conversation: posts and threaded replies, a following feed, and direct messages that arrive as they are typed.',
  author: 'David Mwendwa',
  authorUrl: 'https://github.com/David-mwendwa',
  repo: 'https://github.com/David-mwendwa/JamiiChat',
};

export default site;
