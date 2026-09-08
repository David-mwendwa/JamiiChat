/**
 * Renders the public routes to static HTML after `vite build`.
 *
 * The app still hydrates and behaves as an SPA; this only means the first
 * paint comes from the server's bytes instead of waiting for React to
 * download, parse, execute and mount. It is also the only way anything about
 * this site is legible to a crawler or a link unfurler: Facebook, Slack,
 * WhatsApp and X never run JavaScript, so before this existed every JamiiChat
 * URL pasted anywhere unfurled as an empty <div id="root"> with one generic
 * title, and search engines had a single page to index.
 *
 * Three things make it work, and each is easy to undo by accident:
 *
 *   1. Rendering goes through renderToPipeableStream with `onAllReady`, not
 *      renderToString. Every page is React.lazy behind Suspense, and
 *      renderToString does not await suspended boundaries — it would emit the
 *      fallback for every route, writing a blank page as the static HTML.
 *   2. MemoryRouter from react-router-dom, not StaticRouter from
 *      react-router-dom/server. That entry pulls its own react-router
 *      instance, so the context it provides is not the one the app's
 *      useLocation() reads from.
 *   3. Nothing in the rendered tree may touch `window` during render. Effects
 *      do not run here, so anything inside useEffect is safe; a useState or
 *      useRef initialiser is not. See LandingPage's `reduced` ref.
 *
 * Netlify serves a static file in preference to the SPA `/*` redirect (the
 * redirect has no `force`), so these files win and the redirect stays as the
 * fallback for every path not prerendered.
 *
 * Run through vite-node, not node: this imports JSX.
 *   npm run build   →   vite build && vite-node scripts/prerender.mjs
 */
import { createElement } from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Writable } from 'node:stream';

// React logs this on every server render of a component using useLayoutEffect,
// which is most of them via the app's hooks. It is expected here and says
// nothing about the output; left in, it buries anything that does matter.
const realError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect')) return;
  realError(...args);
};

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dist = join(root, 'dist');

const { default: Root } = await import(new URL('../src/Root.jsx', import.meta.url).href);
const { metaForPath, SITE_URL, ROUTES, PRERENDER_PATHS } = await import(
  new URL('./prerender-meta.mjs', import.meta.url).href
);

const shell = readFileSync(join(dist, 'index.html'), 'utf8');

const escapeAttr = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Rewrites one tag's `content`, and throws if the tag was not there.
 *
 * Silence is the failure mode worth designing against: a renamed or reordered
 * attribute in index.html would leave every prerendered page carrying the
 * landing page's title and description, correct-looking in a browser and wrong
 * in every search result and every shared link. The build should stop instead.
 *
 * The pattern requires `content` to come after the identifying attribute,
 * which is how index.html is written. If that is ever reordered this throws,
 * which is the intended outcome — it is a prompt to look, not a bug.
 */
const setMeta = (html, attr, name, value) => {
  const pattern = new RegExp(
    `(<meta[^>]*?\\b${attr}="${name}"[^>]*?\\bcontent=")([^"]*)(")`,
    's'
  );
  if (!pattern.test(html)) {
    throw new Error(`prerender: no <meta ${attr}="${name}" content="..."> in index.html`);
  }
  return html.replace(pattern, `$1${escapeAttr(value)}$3`);
};

const renderPath = (path) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });

    const { pipe, abort } = renderToPipeableStream(
      createElement(MemoryRouter, { initialEntries: [path] }, createElement(Root)),
      {
        // onAllReady, not onShellReady: every page is behind Suspense, and the
        // shell is the empty fallback. Waiting for all of it is the point.
        onAllReady() {
          sink.on('finish', () => resolve(Buffer.concat(chunks).toString('utf8')));
          pipe(sink);
        },
        onError: reject,
      }
    );

    // A render that never settles would otherwise hang the build forever.
    const timer = setTimeout(() => {
      abort();
      reject(new Error(`prerender: ${path} did not finish in 15s`));
    }, 15_000);
    sink.on('finish', () => clearTimeout(timer));
  });

const canonicalFor = (path) => `${SITE_URL}${path === '/' ? '/' : path}`;

for (const path of PRERENDER_PATHS) {
  const body = await renderPath(path);
  const meta = metaForPath(path);
  const url = canonicalFor(path);

  let html = shell
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttr(meta.title)}</title>`)
    .replace(
      /(<link rel="canonical" href=")[^"]*(")/,
      `$1${escapeAttr(url)}$2`
    );

  html = setMeta(html, 'name', 'description', meta.description);
  html = setMeta(html, 'property', 'og:title', meta.title);
  html = setMeta(html, 'property', 'og:description', meta.ogDescription);
  html = setMeta(html, 'property', 'og:url', url);
  html = setMeta(html, 'name', 'twitter:title', meta.title);
  html = setMeta(html, 'name', 'twitter:description', meta.ogDescription);

  if (meta.noindex) {
    html = html.replace('</head>', '    <meta name="robots" content="noindex" />\n  </head>');
  }

  // The rendered app replaces the empty root, not the whole body: the shell's
  // scripts and stylesheet links are what make the page hydrate at all.
  const withBody = html.replace(
    '<div id="root"></div>',
    `<div id="root">${body}</div>`
  );
  if (withBody === html) {
    throw new Error('prerender: <div id="root"></div> not found in index.html');
  }

  const outDir = path === '/' ? dist : join(dist, path);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), withBody);
  console.log(`  ${path.padEnd(18)} → ${(withBody.length / 1024).toFixed(1)}KB`);
}

/**
 * A sitemap and robots.txt, generated from the same route list.
 *
 * Hand-maintained, both drift the moment a route is added. Generated, they
 * cannot disagree with what was actually written to disk.
 *
 * The disallow list is not a privacy control — the API is what refuses to
 * serve someone else's messages, and it does. It is about crawl budget and
 * about what a search result should be: a settings screen, a signed-out
 * notifications page or an infinite space of search-query URLs are useless
 * results for a real query.
 */
const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ROUTES.map(
  (path) => `  <url>
    <loc>${canonicalFor(path)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${path === '/' ? 'weekly' : 'monthly'}</changefreq>
    <priority>${path === '/' ? '1.0' : '0.7'}</priority>
  </url>`
).join('\n')}
</urlset>
`;
writeFileSync(join(dist, 'sitemap.xml'), sitemap);

const DISALLOW = [
  '/settings',
  '/messages',
  '/notifications',
  '/bookmarks',
  '/admin',
  '/search',
  '/404',
  '/password/reset/',
];
writeFileSync(
  join(dist, 'robots.txt'),
  `User-agent: *\nAllow: /\n${DISALLOW.map((p) => `Disallow: ${p}`).join('\n')}\n\nSitemap: ${SITE_URL}/sitemap.xml\n`
);

console.log(`  sitemap.xml (${ROUTES.length} urls) and robots.txt written`);
