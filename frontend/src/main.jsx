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
 * which is exactly the work prerendering exists to avoid. The dev server and
 * every non-prerendered path send an empty root, so this one entry file keeps
 * both paths working.
 *
 * The chunk has to arrive first: every route is code-split, and hydrating
 * before its component is ready renders the Suspense fallback against a full
 * page of markup, which React treats as a mismatch and re-renders wholesale.
 */
if (container.hasChildNodes()) {
  preloadRoute(window.location.pathname).then(() => hydrateRoot(container, tree));
} else {
  createRoot(container).render(tree);
}
