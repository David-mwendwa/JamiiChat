/**
 * Fails the build when something that is invisible in a browser has broken.
 *
 * Every check here exists because the failure it catches is silent. A
 * prerendered page that renders as an empty root still looks perfect once the
 * app hydrates, and is worthless to a crawler. A font that went back to being
 * fetched from Google still renders, just two round trips later. A page whose
 * meta was not rewritten shows the right content and the wrong title in every
 * search result and every shared link. None of these break a test, and none
 * of them are noticeable without going looking.
 *
 * Runs on `dist/` after vite build and the prerender:
 *   npm run build   →   vite build && prerender && node scripts/verify-build.mjs
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');

const failures = [];
const fail = (message) => failures.push(message);

if (!existsSync(dist)) {
  console.error('verify: dist/ does not exist — run vite build first');
  process.exit(1);
}

const { ROUTES, PRERENDER_PATHS, SITE_URL, metaForPath } = await import(
  new URL('./prerender-meta.mjs', import.meta.url).href
);

const pageFor = (path) =>
  path === '/' ? join(dist, 'index.html') : join(dist, path, 'index.html');

/* --- Every prerendered route exists, and holds a real page ------------- */

const titles = new Map();

for (const path of PRERENDER_PATHS) {
  const file = pageFor(path);
  if (!existsSync(file)) {
    fail(`${path}: not prerendered (${file} missing)`);
    continue;
  }

  const html = readFileSync(file, 'utf8');
  // Authored comments must not reach production. The shell's notes about fonts,
  // preconnects and managed meta tags are for the repo; view-source is not the
  // place to publish them. React's own hydration markers — <!--$-->, <!--/$-->
  // and the <!-- --> text separator — are required and are exempt.
  const authored = [...html.matchAll(/<!--([\s\S]*?)-->/g)]
    .map((m) => m[1])
    .filter((c) => !/^\/?\$|^\s*-?\s*$/.test(c));
  if (authored.length) fail(`${path}: ${authored.length} authored comment(s) reached the built HTML`);

  // Greedy to the LAST closing div, which is the root's own. A non-greedy
  // match stops at the first nested </div> and reports every page as empty.
  // The attribute wildcard matters: the root carries data-prerendered, and a
  // pattern expecting a bare <div id="root"> matches nothing at all — which
  // reports every page as empty and hides the failure this check exists to find.
  const root = html.match(/<div id="root"[^>]*>([\s\S]*)<\/div>/);

  // The stamp is what lets main.jsx tell "this file describes the route being
  // asked for" from "Netlify handed me the SPA fallback". Without it the app
  // hydrates the landing page against whatever route the reader wanted.
  const stamp = html.match(/<div id="root" data-prerendered="([^"]*)"/)?.[1];
  if (stamp !== path) {
    fail(`${path}: data-prerendered is ${JSON.stringify(stamp)}, expected ${JSON.stringify(path)}`);
  }

  // 500 characters is well above an empty root or a lone spinner, and well
  // below the smallest real page here (the 404, at ~1.4KB of markup).
  if (!root || root[1].length < 500) {
    fail(
      `${path}: prerendered root is empty or near-empty (${root ? root[1].length : 0} chars) — ` +
        'renderToString instead of onAllReady, or a render-time crash, would do this'
    );
  }

  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1];
  if (!title) fail(`${path}: no <title>`);
  else {
    // Two routes sharing a title means the prerender did not rewrite one of
    // them, which is exactly the bug this whole step exists to prevent.
    if (titles.has(title)) fail(`${path}: shares its <title> with ${titles.get(title)}`);
    titles.set(title, path);
  }

  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  // Trailing slash: that is the URL Netlify serves for a prerendered route,
  // and canonical has to name the document rather than the redirect to it.
  const expected = `${SITE_URL}${path === '/' ? '/' : `${path}/`}`;
  if (canonical !== expected) {
    fail(`${path}: canonical is ${canonical ?? 'missing'}, expected ${expected}`);
  }

  for (const tag of ['og:title', 'og:description', 'og:url', 'og:image']) {
    const value = html.match(new RegExp(`property="${tag}"[^>]*content="([^"]*)"`, 's'))?.[1];
    if (!value) fail(`${path}: ${tag} is missing or empty`);
    // A relative og:image is ignored by every unfurler, which renders a blank
    // card rather than an error.
    else if (tag === 'og:image' && !value.startsWith('http')) {
      fail(`${path}: og:image must be an absolute URL, got ${value}`);
    }
  }

  const description = html.match(/name="description"[^>]*content="([^"]*)"/s)?.[1];
  if (!description) fail(`${path}: description is missing`);
  // Length only matters where the page is meant to appear in results. The 404
  // is noindex, and one honest sentence is the right length for it.
  else if (!metaForPath(path).noindex && description.length < 50) {
    fail(`${path}: description is ${description.length} chars — too short to be useful`);
  }
}

/* --- The 404 must never be indexable, and never in the sitemap -------- */

const notFound = readFileSync(join(dist, '404', 'index.html'), 'utf8');
if (!/name="robots"[^>]*content="noindex"/.test(notFound)) {
  fail('/404: missing <meta name="robots" content="noindex">');
}

/* --- Fonts are ours, and are actually there --------------------------- */

const shell = readFileSync(join(dist, 'index.html'), 'utf8');
const css = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.css'));
for (const file of css) {
  const text = readFileSync(join(dist, 'assets', file), 'utf8');
  if (text.includes('fonts.googleapis.com')) {
    fail(
      `assets/${file}: imports fonts from Google. Self-hosted faces live in ` +
        'public/fonts — an @import here blocks render on two extra round trips'
    );
  }
}
if (!shell.includes('rel="preload"') || !shell.includes('PlusJakartaSans.woff2')) {
  fail('index.html: the heading face is no longer preloaded');
}
for (const font of ['PlusJakartaSans.woff2', 'Inter.woff2', 'JetBrainsMono.woff2']) {
  if (!existsSync(join(dist, 'fonts', font))) fail(`fonts/${font}: missing from the build`);
}
if (!existsSync(join(dist, 'fonts', 'fonts.css'))) fail('fonts/fonts.css: missing from the build');

/* --- The unfurl image exists and is worth fetching -------------------- */

const og = join(dist, 'og.jpg');
if (!existsSync(og)) fail('og.jpg: missing — run npm run og');
else {
  const kb = statSync(og).size / 1024;
  // Not a hard limit anywhere, but past this an unfurl is slow enough that
  // some clients give up and show no image at all.
  if (kb > 800) fail(`og.jpg: ${kb.toFixed(0)}KB is too heavy for a link preview`);
}

/* --- Sitemap and robots ----------------------------------------------- */

const sitemap = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
for (const path of ROUTES) {
  const url = `${SITE_URL}${path === '/' ? '/' : `${path}/`}`;
  if (!sitemap.includes(`<loc>${url}</loc>`)) fail(`sitemap.xml: ${url} missing`);
}
if (sitemap.includes('/404')) fail('sitemap.xml: lists /404, which is noindex');

const robots = readFileSync(join(dist, 'robots.txt'), 'utf8');
if (!robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) {
  fail('robots.txt: does not point at the sitemap');
}

/* --- No chunk has crept back into being the old monolith -------------- */

const js = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'));
const entry = js
  .map((f) => ({ f, size: statSync(join(dist, 'assets', f)).size }))
  .sort((a, b) => b.size - a.size)[0];
// The whole app was one 470KB chunk before it was split. React itself is the
// largest legitimate chunk at ~230KB; anything materially past that means the
// splitting has been undone.
if (entry && entry.size > 300 * 1024) {
  fail(
    `assets/${entry.f}: ${(entry.size / 1024).toFixed(0)}KB — the route splitting has regressed`
  );
}

// public/ is copied into dist untouched, so the notes in fonts.css, robots.txt
// and the logo SVGs are served to anyone who opens them — a favicon is fetched
// by every browser tab. fonts.css is also render-blocking, which puts its
// comment bytes on the critical path. dist/assets is skipped: Vite minifies
// what it emits there, and its `/*!` licence headers are meant to survive.
const checkAssetComments = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'assets') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      checkAssetComments(full);
      continue;
    }
    const marker = entry.name.endsWith('.svg')
      ? /<!--/
      : entry.name.endsWith('.css')
        ? /\/\*/
        : entry.name.endsWith('.txt')
          ? /^[ \t]*#/m
          : null;
    if (marker && marker.test(readFileSync(full, 'utf8'))) {
      fail(`${full.slice(full.indexOf('dist'))}: authored comments reached the build`);
    }
  }
};
checkAssetComments(dist);

if (failures.length) {
  console.error(`\nverify: ${failures.length} problem${failures.length === 1 ? '' : 's'}\n`);
  for (const message of failures) console.error(`  ✗ ${message}`);
  console.error('');
  process.exit(1);
}

console.log(`  verify: ${PRERENDER_PATHS.length} prerendered routes, fonts, meta and sitemap OK`);
