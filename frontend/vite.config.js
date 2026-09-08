import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Injects a preconnect for the API origin into the HTML shell.
 *
 * The API is on a different host to the site (Netlify serves the frontend,
 * Render the API and the socket), so the very first request the app makes has
 * to pay a DNS lookup, a TCP connection and a TLS handshake before it can even
 * start. Told about the origin at parse time, the browser does all three while
 * the JS bundle is still downloading, and the session check lands on a
 * connection that is already open.
 *
 * It is derived from VITE_API_URL rather than being its own variable on
 * purpose: netlify.toml promises there is only ever one value to set, and a
 * second one that has to agree with the first is a thing to get wrong. The
 * `crossorigin` attribute is required — the API is a CORS endpoint, and a
 * preconnect without it warms a connection in the wrong credentials mode,
 * which the real request then cannot reuse.
 */
const apiPreconnect = (apiUrl) => ({
  name: 'jamii-api-preconnect',
  transformIndexHtml() {
    let origin;
    try {
      origin = new URL(apiUrl).origin;
    } catch {
      return [];
    }
    // Same-origin with the site would be a pointless hint, and in dev the
    // localhost API needs no warming.
    if (origin.startsWith('http://localhost')) return [];
    return [
      {
        tag: 'link',
        attrs: { rel: 'preconnect', href: origin, crossorigin: true },
        injectTo: 'head-prepend',
      },
    ];
  },
});

// Pinned port: this workspace runs several Vite dev servers at once, and the
// backend's CORS allowlist needs a fixed origin to match against rather than
// whatever port happens to be free.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL || 'http://localhost:5007/api/v1';

  return {
    plugins: [react(), apiPreconnect(apiUrl)],
    server: {
      port: 5012,
      strictPort: true,
    },
    build: {
      // The entry chunk was 470KB with everything in it. Route splitting does
      // most of the work; this keeps the dependencies that never change out of
      // the file that changes on every deploy, so a returning reader
      // re-downloads app code and keeps React from cache.
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (!id.includes('node_modules')) return undefined;
            // React and the router ship together deliberately. react-router
            // reaches into React's internals, and splitting them into separate
            // chunks buys nothing — they are always both needed, and always
            // updated together — while adding one more request to the critical
            // path.
            if (/node_modules\/(react|react-dom|scheduler|react-router)/.test(id))
              return 'react';
            return undefined;
          },
        },
      },
      // The default is 500KB, which this build no longer approaches. Lowered so
      // a chunk creeping back over a quarter of a megabyte is a warning rather
      // than something nobody notices until it is 470KB again.
      chunkSizeWarningLimit: 250,
    },
  };
});
