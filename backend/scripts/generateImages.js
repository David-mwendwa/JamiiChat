import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

import { people, demoAccounts } from '../data/seedContent.js';

// Generates the avatar, cover and post artwork the seed needs.
//
// These are drawn here rather than downloaded: photographs of real people carry
// licensing and consent problems that a portfolio project should not take on,
// and a remote image API makes the seed fail whenever the network does. Each
// image is deterministic from a handle, so reseeding produces the same faces
// and a screenshot stays accurate.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA = path.join(__dirname, '..', 'public', 'media', 'seed');

// A stable hash so one handle always lands on the same hue pair.
const hash = (value) => {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) % 100000;
  return h;
};

// Hues sampled around the wheel but skipping the muddy 60–95° band, so no
// avatar comes out the colour of dishwater.
const WHEEL = [258, 275, 292, 316, 340, 355, 12, 26, 38, 168, 186, 200, 214, 232];

const hueFor = (seed) => WHEEL[seed % WHEEL.length];

// The companion hue is picked from the same curated wheel rather than by adding
// a fixed offset. Offsetting walked straight back into the band the wheel
// exists to avoid — an orange primary at 38° produced an 84° yellow-green
// partner, which is exactly the colour this list was built to exclude.
const pairHueFor = (seed) => WHEEL[(seed % WHEEL.length + 4) % WHEEL.length];

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

// Avatar: a duotone field with soft blobs behind the initials. Reads as a
// portrait slot at 44px without pretending to be a photograph.
const avatarSvg = (name, seed) => {
  const h = hueFor(seed);
  const h2 = pairHueFor(seed);
  const r = 200;
  const blobs = Array.from({ length: 3 }, (_, i) => {
    const a = ((seed >> (i * 3)) % 360) * (Math.PI / 180);
    const cx = 200 + Math.cos(a) * (70 + (seed % 40));
    const cy = 200 + Math.sin(a) * (70 + ((seed >> 2) % 40));
    const rr = 90 + ((seed >> (i + 1)) % 60);
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr}" fill="hsl(${(h2 + i * 14) % 360} 85% 62%)" opacity="0.5"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${h} 72% 52%)"/>
      <stop offset="1" stop-color="hsl(${h2} 68% 38%)"/>
    </linearGradient>
    <clipPath id="c"><circle cx="200" cy="200" r="${r}"/></clipPath>
  </defs>
  <g clip-path="url(#c)">
    <rect width="400" height="400" fill="url(#g)"/>
    ${blobs}
  </g>
  <text x="200" y="200" text-anchor="middle" dominant-baseline="central"
        font-family="Helvetica, Arial, sans-serif" font-size="150" font-weight="700"
        fill="white" fill-opacity="0.94">${initials(name)}</text>
</svg>`;
};

// Cover: wide, low-contrast, and dark enough at the bottom-left that the avatar
// and name sitting on it stay legible.
const coverSvg = (seed) => {
  const h = hueFor(seed);
  const h2 = pairHueFor(seed);

  const waves = Array.from({ length: 5 }, (_, i) => {
    const y = 120 + i * 52 + (seed % 30);
    const amp = 40 + ((seed >> i) % 50);
    return `<path d="M0 ${y} Q 375 ${y - amp} 750 ${y} T 1500 ${y} V 500 H 0 Z"
      fill="hsl(${(h2 + i * 8) % 360} 55% ${16 + i * 4}%)" opacity="0.38"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="500" viewBox="0 0 1500 500">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${h} 48% 22%)"/>
      <stop offset="1" stop-color="hsl(${h2} 52% 12%)"/>
    </linearGradient>
  </defs>
  <rect width="1500" height="500" fill="url(#bg)"/>
  ${waves}
</svg>`;
};

// Post artwork: abstract cards for the handful of seeded posts that carry an
// image, so the media grid is exercised by the seed rather than only by uploads.
const postSvg = (seed, label) => {
  const h = hueFor(seed);
  const h2 = pairHueFor(seed);
  const shapes = Array.from({ length: 6 }, (_, i) => {
    const x = ((seed * (i + 3)) % 1000) + 50;
    const y = ((seed >> (i + 1)) % 600) + 40;
    const s = 70 + ((seed >> i) % 190);
    const rot = (seed * (i + 1)) % 90;
    return i % 2 === 0
      ? `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s / 6}" transform="rotate(${rot} ${x} ${y})" fill="hsl(${(h2 + i * 18) % 360} 80% 60%)" opacity="0.38"/>`
      : `<circle cx="${x}" cy="${y}" r="${s / 2}" fill="hsl(${(h + i * 18) % 360} 82% 66%)" opacity="0.34"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${h} 45% 16%)"/>
      <stop offset="1" stop-color="hsl(${h2} 50% 24%)"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="750" fill="url(#bg)"/>
  ${shapes}
  <text x="60" y="690" font-family="Helvetica, Arial, sans-serif" font-size="42"
        font-weight="700" fill="white" fill-opacity="0.82">${label}</text>
</svg>`;
};

const write = async (name, svg) => {
  const out = path.join(MEDIA, name);
  await sharp(Buffer.from(svg)).webp({ quality: 86 }).toFile(out);
  return `/media/seed/${name}`;
};

// Labels for the posts that get artwork, keyed by the handle that posts them.
export const POST_ART = {
  wanjiku: 'before / after',
  njeri: 'pipeline: 40min → 4min',
  dennis: 'sort the mangoes',
  amina: 'empty states, redrawn',
  grace_ui: 'keyboard-only audit',
  faith_ml: 'the 95% trap',
};

const run = async () => {
  await fs.mkdir(MEDIA, { recursive: true });

  const everyone = [
    ...people,
    ...demoAccounts.map((a) => ({ handle: a.handle, displayName: a.displayName })),
  ];

  const manifest = { avatars: {}, covers: {}, posts: {} };

  for (const person of everyone) {
    const seed = hash(person.handle);
    manifest.avatars[person.handle] = await write(
      `avatar-${person.handle}.webp`,
      avatarSvg(person.displayName, seed)
    );
    manifest.covers[person.handle] = await write(
      `cover-${person.handle}.webp`,
      coverSvg(seed)
    );
  }

  for (const [handle, label] of Object.entries(POST_ART)) {
    manifest.posts[handle] = await write(
      `post-${handle}.webp`,
      postSvg(hash(handle + 'post'), label)
    );
  }

  await fs.writeFile(
    path.join(__dirname, '..', 'data', 'mediaManifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  console.log(
    `Generated ${everyone.length} avatars, ${everyone.length} covers, ${Object.keys(POST_ART).length} post images`
  );
};

run().catch((err) => {
  console.error('Image generation failed:', err);
  process.exit(1);
});
