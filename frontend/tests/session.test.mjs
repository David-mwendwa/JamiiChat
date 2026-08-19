// Signing out must not hand the next person your location.
//
// Logging out from /messages/<id> used to leave RequireAuth mounted on that
// path; it redirected to /login carrying it as `from`, and whoever signed in
// next — a different account entirely — was sent straight to the previous
// user's conversation.
//
// Needs a browser and a running dev server:
//   npm run dev, then `node tests/session.test.mjs`

const EXEC_CANDIDATES = [
  process.env.CHROME_PATH,
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const WEB = process.env.WEB_URL ?? 'http://localhost:5012';

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.log('playwright-core not installed — skipping session test');
  process.exit(0);
}

const { existsSync } = await import('fs');
const executablePath = EXEC_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.log('no chromium binary found — skipping session test');
  process.exit(0);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1360, height: 940 } });

const signIn = async (identifier, password) => {
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#identifier', identifier);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1800);
};

await signIn('demo', 'demo12345');
check('demo signs in', !page.url().includes('/login'), page.url());

// Open a real conversation, so the URL carries an id scoped to this account.
await page.goto(`${WEB}/messages`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.click('a[href^="/messages/"]');
await page.waitForTimeout(1500);

const conversationUrl = page.url();
check('demo opens a conversation', /\/messages\/[a-f0-9]{24}/.test(conversationUrl), conversationUrl);

// Sign out from inside that conversation — the exact reported path.
await page.click('button[aria-label="Sign out"]');
await page.waitForTimeout(1500);
check('sign out leaves the conversation', !/\/messages\//.test(page.url()), page.url());

await signIn('admin@jamii.app', 'admin12345');
const landed = page.url();
check('admin does NOT land in the previous account\'s conversation', !/\/messages\//.test(landed), landed);
check('admin lands on the home feed', new URL(landed).pathname === '/', landed);

// Back must not return to a signed-in screen from the previous session.
await page.goBack();
await page.waitForTimeout(1200);
check('back does not restore the old conversation', !/\/messages\/[a-f0-9]{24}/.test(page.url()), page.url());

await browser.close();

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
