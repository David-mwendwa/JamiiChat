import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Rasterises scripts/og-card.svg into public/og.jpg — the 1200x630 image every
 * unfurler renders when a JamiiChat link is shared.
 *
 * JPEG, not PNG. The card is mostly large soft gradients, which is close to
 * PNG's worst case and JPEG's best: the same artwork is 867KB as a PNG and
 * 105KB at quality 90, with no visible difference in the crisp type. An
 * unfurl image is fetched by every service that renders a shared link, so the
 * eight-fold saving is worth more than a lossless encode nobody can see.
 *
 * The step that matters is the font inlining. A rasteriser cannot fetch a
 * webfont, which is a true statement about a *linked* font and a false one
 * about an embedded one: QuickLook renders through WebKit, which honours an
 * @font-face whose src is a base64 woff2 in the document itself. So the face
 * is read off disk and injected here, and the card is set in the same Plus
 * Jakarta Sans as the app rather than in whatever the rasteriser falls back to.
 *
 * It is injected rather than pasted into the SVG because the base64 runs to
 * ~36KB, which would bury the artwork anyone editing this actually needs to
 * read, and would have to be redone by hand whenever the subset changes. The
 * SVG keeps a single empty style element as the seam.
 *
 * The weights deliberately mirror public/fonts/fonts.css, whose subset is
 * latin-only. The card's copy is plain ASCII apart from nothing at all, so the
 * range covers it — but a glyph outside the subset falls back silently, so
 * look at the PNG after changing the copy.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const FACES = [{ family: 'Plus Jakarta Sans', file: 'PlusJakartaSans.woff2', weight: '400 800' }];

const fontCss = FACES.map(({ family, file, weight }) => {
  const data = readFileSync(join(root, 'public/fonts', file)).toString('base64');
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${data}) format('woff2');}`;
}).join('\n');

const SEAM = '<style id="fonts" />';
const svgPath = join(root, 'scripts/og-card.svg');
const svg = readFileSync(svgPath, 'utf8');
if (!svg.includes(SEAM)) {
  throw new Error(`og-card.svg is missing its font seam: ${SEAM}`);
}

const work = mkdtempSync(join(tmpdir(), 'jamii-og-'));
const src = join(work, 'og-card.svg');
writeFileSync(src, svg.replace(SEAM, `<style>${fontCss}</style>`));

// qlmanage rasterises into a square, which is why the source is 1200x1200 with
// the card in a band; sips then crops that band back out at 1:1.
execFileSync('qlmanage', ['-t', '-s', '1200', '-o', work, src], { stdio: 'ignore' });
execFileSync(
  'sips',
  [
    '-c',
    '630',
    '1200',
    join(work, 'og-card.svg.png'),
    '-s',
    'format',
    'jpeg',
    '-s',
    'formatOptions',
    '90',
    '--out',
    join(root, 'public/og.jpg'),
  ],
  { stdio: 'ignore' }
);

console.log('public/og.jpg regenerated');
