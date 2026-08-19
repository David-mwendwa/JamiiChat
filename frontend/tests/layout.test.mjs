// Guards the app shell's geometry as you navigate.
//
// The nav rail must sit at the same offset on every route — it is what the
// pointer is aimed at when you click between tabs, and it moving mid-click was
// the original complaint.
//
// The reading column is checked against two allowed shapes: the standard feed
// width everywhere, and a wider column on Messages, which deliberately drops
// the right rail and takes that space for the conversation. Any other width is
// an accident.
//
// Needs a browser and a running dev server:
//   npm run dev, then `node tests/layout.test.mjs`
// Skips cleanly when playwright-core is not installed.

const EXEC_CANDIDATES = [
  process.env.CHROME_PATH,
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const WEB = process.env.WEB_URL ?? 'http://localhost:5012';
const API = process.env.API_URL ?? 'http://localhost:5007';

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.log('playwright-core not installed — skipping layout test');
  process.exit(0);
}

const { existsSync } = await import('fs');
const executablePath = EXEC_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.log('no chromium binary found — skipping layout test');
  process.exit(0);
}

const res = await fetch(`${API}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: 'demo', password: 'demo12345' }),
});
const { token } = await res.json();
if (!token) throw new Error('could not sign in as the demo account — is the database seeded?');

const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 1360, height: 940 } });
await context.addInitScript((t) => localStorage.setItem('jamii:token', t), token);
const page = await context.newPage();

const WIDE_ROUTES = ['/messages'];
const routes = ['/', '/explore', '/notifications', '/messages', '/bookmarks', '/settings', '/demo'];
const measurements = [];

for (const route of routes) {
  await page.goto(WEB + route, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  measurements.push([
    route,
    await page.evaluate(() => {
      const main = document.querySelector('main')?.getBoundingClientRect();
      const rail = document.querySelector('header nav')?.closest('header')?.getBoundingClientRect();
      return {
        railLeft: rail ? Math.round(rail.left) : null,
        mainLeft: main ? Math.round(main.left) : null,
        mainWidth: main ? Math.round(main.width) : null,
      };
    }),
  ]);
}

await browser.close();

const [, baseline] = measurements.find(([r]) => !WIDE_ROUTES.includes(r));
const narrowWidth = baseline.mainWidth;

const failures = [];
for (const [route, m] of measurements) {
  const wide = WIDE_ROUTES.includes(route);
  const problems = [];

  // The rail is the invariant: it must not move, on any route.
  if (m.railLeft !== baseline.railLeft) problems.push(`rail moved to ${m.railLeft}`);
  if (m.mainLeft !== baseline.mainLeft) problems.push(`main moved to ${m.mainLeft}`);
  if (wide) {
    if (m.mainWidth <= narrowWidth) problems.push(`expected a wider column, got ${m.mainWidth}`);
  } else if (m.mainWidth !== narrowWidth) {
    problems.push(`expected width ${narrowWidth}, got ${m.mainWidth}`);
  }

  if (problems.length) failures.push([route, problems]);
  console.log(
    `${problems.length ? 'FAIL' : 'PASS'}  ${route.padEnd(15)} rail@${m.railLeft} main@${m.mainLeft} w=${m.mainWidth}${wide ? '  (wide)' : ''}`
  );
}

if (failures.length) {
  for (const [route, problems] of failures) console.error(`  ${route}: ${problems.join('; ')}`);
  process.exit(1);
}
console.log('\nLayout holds: rail pinned everywhere, Messages wider by design.');
