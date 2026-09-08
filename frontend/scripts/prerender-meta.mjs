/**
 * Per-route title and description for the prerendered HTML.
 *
 * These duplicate what each page passes to `usePageMeta`, and the duplication
 * is deliberate. The hook sets its tags in an effect, so they only exist once
 * the app has hydrated — a crawler reading the static file, and every link
 * unfurler without exception, would otherwise see the landing page's title on
 * every route. If a page's meta changes, change it in both places.
 *
 * Only routes whose content is genuinely static live here. A profile, a thread
 * or a tag feed is assembled from the API at request time; prerendering one
 * would freeze whatever the database held at build time into a file served for
 * weeks. Those routes keep the shell's tags and rely on the hook.
 */
const { site } = await import(new URL('../src/data/site.js', import.meta.url).href);

/**
 * The origin every absolute URL is built from.
 *
 * `site.url` is the answer in almost every case: canonical has to name the
 * production site, not whatever host ran the build, or a deploy preview tells
 * search engines the preview is the real page. SITE_URL exists only to point a
 * build at a genuinely different origin — a staging domain, or a fork.
 */
export const SITE_URL = (process.env.SITE_URL || site.url).replace(/\/$/, '');

/**
 * A real route in this app, unlike the usual prerender convention.
 *
 * App.jsx redirects every unmatched path to `/404`, so it is a page people
 * genuinely land on and it is worth serving as static HTML like the rest. It
 * is deliberately absent from `ROUTES`: it must never reach the sitemap, and
 * its meta carries `noindex`.
 *
 * Netlify's own `404.html` convention is not used here, because netlify.toml
 * redirects every unmatched path to the SPA shell with a 200 — so a 404.html
 * would be written and never served.
 */
export const NOT_FOUND_PATH = '/404';

/**
 * The routes written as static HTML, and the only ones in the sitemap.
 *
 * `/` is the landing page — signed out, which is what a crawler always is.
 * The auth screens are here because they are real destinations people link to
 * and because they are pure markup. Everything else in the app is either
 * someone's private screen or a database query.
 */
export const ROUTES = ['/', '/login', '/register', '/password/forgot'];

/** Everything written as static HTML: the indexable routes plus the 404. */
export const PRERENDER_PATHS = [...ROUTES, NOT_FOUND_PATH];

const META = {
  '/': {
    title: null,
    description: site.description,
    ogDescription: site.shortDescription,
  },
  '/login': {
    title: 'Sign in',
    description: 'Sign in to JamiiChat to post, follow and pick up your conversations.',
  },
  '/register': {
    title: 'Create account',
    description:
      'Create a JamiiChat account — pick a handle, follow a few people and start posting.',
  },
  '/password/forgot': {
    title: 'Reset your password',
    description: 'Send a reset link to the email address on your JamiiChat account.',
  },
  [NOT_FOUND_PATH]: {
    title: 'Page not found',
    description: 'That page does not exist on JamiiChat.',
    noindex: true,
  },
};

export const metaForPath = (path) => {
  const hit = META[path] ?? META['/'];
  const title = hit.title ? `${hit.title} · ${site.name}` : `${site.name} — ${site.tagline}`;
  return {
    title,
    description: hit.description,
    // Unfurls truncate hard, so og:/twitter: get the short form where one is
    // given and the full description otherwise.
    ogDescription: hit.ogDescription ?? hit.description,
    noindex: Boolean(hit.noindex),
  };
};

export default metaForPath;
