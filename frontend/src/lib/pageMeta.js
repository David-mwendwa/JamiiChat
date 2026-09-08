import { useEffect } from 'react';
import { site } from '../data/site.js';

/**
 * Sets the document title, description and canonical URL for a route.
 *
 * Every one of the app's routes shared the single `<title>` baked into
 * index.html. A reader with a profile, a thread and their notifications open
 * saw three tabs all reading "JamiiChat", every bookmark saved under the same
 * name, and every link pasted anywhere previewed as the homepage regardless of
 * what it pointed at.
 *
 * Tags are patched in place rather than appended, so passing through twenty
 * routes leaves one description tag and one canonical, not twenty.
 *
 * What this can and cannot do is worth being precise about. Facebook, Slack,
 * WhatsApp and X read the static bytes and never run the app, so for them the
 * og: tags that count are the ones scripts/prerender.mjs writes into the HTML
 * at build time — these client-side ones do nothing. Google does render the
 * page, so for search specifically the title, description and canonical set
 * here are read. That is why the public entry points are prerendered and the
 * dynamic screens settle for this.
 *
 * Deliberately not a library. react-helmet-async is ~7KB to set four strings,
 * on an app whose whole point of this exercise was to stop shipping bytes
 * nobody needs.
 */
export function usePageMeta(title, description, { noindex = false } = {}) {
  useEffect(() => {
    document.title = title ? `${title} · ${site.name}` : `${site.name} — ${site.tagline}`;

    const setMeta = (selector, content) => {
      if (!content) return;
      const tag = document.head.querySelector(selector);
      if (tag) tag.setAttribute('content', content);
    };

    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', document.title);
    setMeta('meta[name="twitter:title"]', document.title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[name="twitter:description"]', description);

    // Path only, never the query string. Search, tag and feed screens carry
    // cursors and filters that name the same page — canonical exists to say
    // which single URL that is.
    const url = `${site.url}${window.location.pathname}`;
    setMeta('meta[property="og:url"]', url);

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);

    /*
     * Signed-in screens ask not to be indexed.
     *
     * Not a privacy measure — the API is what refuses to serve someone else's
     * bookmarks, and it does. This is about what a search result should be: a
     * settings page or an empty signed-out notifications screen is a useless
     * result for a real query, and a crawler that indexes twenty of them
     * spends the site's crawl budget on pages nobody can act on. robots.txt
     * disallows the same paths; this covers a URL reached some other way.
     */
    const existing = document.head.querySelector('meta[name="robots"]');
    if (noindex) {
      if (existing) existing.setAttribute('content', 'noindex');
      else {
        const tag = document.createElement('meta');
        tag.setAttribute('name', 'robots');
        tag.setAttribute('content', 'noindex');
        document.head.appendChild(tag);
      }
    } else if (existing) {
      existing.remove();
    }
  }, [title, description, noindex]);
}

export default usePageMeta;
