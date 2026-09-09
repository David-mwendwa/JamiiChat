import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import Root from './Root.jsx';
import { preloadRoute } from './App.jsx';
import './index.css';

// The app itself is in Root.jsx, which scripts/prerender.mjs renders too — the
// browser and the build differ only in the router wrapped around it.
const container = document.getElementById('root');

const tree = (
  <StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </StrictMode>
);

/*
 * Hydrate a prerendered page; mount a fresh one otherwise.
 *
 * The public routes are written to static HTML at build time, so #root already
 * holds the page and React only has to attach listeners to it. Calling
 * createRoot there would throw that markup away and rebuild it from scratch,
 * which is exactly the work prerendering exists to avoid.
 *
 * A non-empty root is NOT enough to decide that. Netlify answers any path it
 * has no file for with the SPA fallback, and that fallback is index.html — the
 * prerendered landing page, markup and all. So `/explore` arrives carrying the
 * landing page's DOM, and hydrating it against the Explore route makes React
 * discard the document and rebuild it, logging error #418: the prerender is
 * undone on precisely the routes it never covered. The build stamps each file
 * with the path it was rendered for, and only that path may adopt the markup.
 *
 * The chunk has to arrive first: every route is code-split, and hydrating
 * before its component is ready renders the Suspense fallback against a full
 * page of markup, which React treats as a mismatch and re-renders wholesale.
 */
const normalise = (p) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
const prerenderedFor = container.dataset.prerendered;
const canHydrate =
  container.hasChildNodes() &&
  prerenderedFor !== undefined &&
  normalise(prerenderedFor) === normalise(window.location.pathname);

if (canHydrate) {
  preloadRoute(window.location.pathname).then(() => hydrateRoot(container, tree));
} else {
  createRoot(container).render(tree);
}
