import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import multer from 'multer';
import sharp from 'sharp';
import { BadRequestError } from '../errors/customErrors.js';
import { uploadBuffer, removeFromCloudinary, isCloudinaryConfigured } from '../utils/cloudinary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = path.join(__dirname, '..', 'public', 'media');
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || 'jamiichat';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// Held in memory so sharp can re-encode before anything reaches disk: an
// upload that never gets written cannot be served back by mistake.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.has(file.mimetype))
      return cb(new BadRequestError('Images only — JPEG, PNG, WebP or GIF'));
    cb(null, true);
  },
});

export const uploadSingle = (field) => upload.single(field);
export const uploadMany = (field, max = 4) => upload.array(field, max);

// A voice message is either an image-message send or a recorded-audio send,
// never both, but they need different validation — a shared multer instance
// with a single `ALLOWED` set can't express that, since `fileFilter` would
// have to accept both mimetype lists for every field. `file.fieldname` lets
// one filter branch per field instead of standing up a second multer stack.
const ALLOWED_AUDIO = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']);
const AUDIO_EXTENSION = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

const ALLOWED_VIDEO = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const VIDEO_EXTENSION = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

const messageMediaUpload = multer({
  storage: multer.memoryStorage(),
  // Shared across the image/audio/video fields on this instance — multer has
  // no per-field limit, and a video clip needs more headroom than a photo or
  // a voice note, so the whole instance uses the larger figure.
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'image') {
      if (!ALLOWED.has(file.mimetype))
        return cb(new BadRequestError('Images only — JPEG, PNG, WebP or GIF'));
      return cb(null, true);
    }
    if (file.fieldname === 'audio') {
      if (!ALLOWED_AUDIO.has(file.mimetype))
        return cb(new BadRequestError('That audio format is not supported'));
      return cb(null, true);
    }
    if (file.fieldname === 'video') {
      if (!ALLOWED_VIDEO.has(file.mimetype))
        return cb(new BadRequestError('Videos only — MP4, WebM or MOV'));
      return cb(null, true);
    }
    cb(new BadRequestError('Unexpected upload field'));
  },
}).fields([
  { name: 'image', maxCount: 1 },
  { name: 'audio', maxCount: 1 },
  { name: 'video', maxCount: 1 },
]);

export const uploadMessageMedia = messageMediaUpload;

// Voice messages are stored as-is rather than re-encoded like images — there
// is no audio pipeline here, sharp only decodes images — but the extension
// still comes from the mimetype `fileFilter` above already checked against an
// allowlist, never from a client-supplied filename. A recorded blob has no
// filename to spoof in the first place; this keeps the same rule anyway,
// since the mimetype itself is still client-declared and worth not trusting
// blindly for anything beyond picking a matching extension.
export const saveAudio = async (file) => {
  const ext = AUDIO_EXTENSION[file.mimetype];
  const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;

  if (isCloudinaryConfigured()) {
    // Cloudinary files audio under `resource_type: 'video'` — there is no
    // separate audio type. `public_id` carries the same name local storage
    // would have used, purely so the two paths are recognisable as the same
    // asset in logs/dashboards, not because anything parses it back.
    const result = await uploadBuffer(file.buffer, {
      folder: `${CLOUDINARY_FOLDER}/audio`,
      public_id: name.replace(/\.[^.]+$/, ''),
      resource_type: 'video',
    });
    return result.secure_url;
  }

  await fs.mkdir(MEDIA_DIR, { recursive: true });
  await fs.writeFile(path.join(MEDIA_DIR, name), file.buffer);
  return `/media/${name}`;
};

// Stored as recorded, same as a voice note — there is no transcoding pipeline
// here (sharp only decodes images), so a chat video keeps whatever the sender's
// device produced rather than being re-encoded to a common format/bitrate.
export const saveVideo = async (file) => {
  const ext = VIDEO_EXTENSION[file.mimetype];
  const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;

  if (isCloudinaryConfigured()) {
    const result = await uploadBuffer(file.buffer, {
      folder: `${CLOUDINARY_FOLDER}/videos`,
      public_id: name.replace(/\.[^.]+$/, ''),
      resource_type: 'video',
    });
    return result.secure_url;
  }

  await fs.mkdir(MEDIA_DIR, { recursive: true });
  await fs.writeFile(path.join(MEDIA_DIR, name), file.buffer);
  return `/media/${name}`;
};

const PRESETS = {
  avatar: { width: 400, height: 400, fit: 'cover' },
  cover: { width: 1500, height: 500, fit: 'cover' },
  post: { width: 1200, height: 1200, fit: 'inside' },
  // Chat images render inside a bubble at a fraction of the column width, so
  // there is no reason to keep them at full post resolution.
  message: { width: 800, height: 800, fit: 'inside' },
};

// The extension comes from what sharp reports after decoding, never from the
// client-supplied filename — a file called `avatar.png` carrying something else
// entirely must not end up served as a png. Re-encoding also drops EXIF, which
// removes the GPS coordinates phones attach to photos.
//
// Cloudinary is used when it's configured and local disk otherwise, so the
// app keeps working out of the box in dev but doesn't need any code changes
// to go live — this is the fallback storeImage() uses in BazaarKE. Local disk
// is fine for dev; on an ephemeral host (Render, Fly, a container) anything
// written here vanishes on the next deploy, which is exactly when you'd add
// the Cloudinary credentials.
export const processImage = async (buffer, preset = 'post') => {
  const { width, height, fit } = PRESETS[preset] ?? PRESETS.post;

  const pipeline = sharp(buffer, { animated: true });
  const meta = await pipeline.metadata();
  if (!meta.format) throw new BadRequestError('That file is not a readable image');

  const output = await pipeline
    .rotate()
    .resize({ width, height, fit, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.webp`;

  if (isCloudinaryConfigured()) {
    const result = await uploadBuffer(output.data, {
      folder: `${CLOUDINARY_FOLDER}/${preset}s`,
      public_id: name.replace(/\.[^.]+$/, ''),
      resource_type: 'image',
    });
    return { url: result.secure_url, width: output.info.width, height: output.info.height };
  }

  await fs.mkdir(MEDIA_DIR, { recursive: true });
  await fs.writeFile(path.join(MEDIA_DIR, name), output.data);

  return {
    url: `/media/${name}`,
    width: output.info.width,
    height: output.info.height,
  };
};

// Best-effort cleanup of a *replaced* asset (a new avatar/cover overwriting an
// old one). Never throws — failing to delete the old file is not a reason to
// fail a request that already saved the new one. Two things are deliberately
// left alone: seed artwork (`/media/seed/…`, committed to the repo and shared
// by many accounts) and anything that isn't recognisably one of our own
// upload URLs, since a stored value could in principle be hand-edited.
export const deleteStoredFile = async (url) => {
  if (!url) return;
  try {
    if (url.startsWith('/media/')) {
      if (url.startsWith('/media/seed/')) return;
      const target = path.join(MEDIA_DIR, url.slice('/media/'.length));
      if (!target.startsWith(MEDIA_DIR + path.sep)) return;
      await fs.unlink(target);
      return;
    }

    // Cloudinary's `secure_url` is always `.../<image|video>/upload/v<n>/<public_id>.<ext>`
    // for an asset uploaded the way `uploadBuffer` above does it — no
    // transformations in the URL to account for.
    const match = /^https?:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\/v\d+\/(.+)\.[a-zA-Z0-9]+$/.exec(
      url
    );
    if (!match) return;
    const [, resourceType, publicId] = match;
    await removeFromCloudinary(publicId, { resource_type: resourceType });
  } catch {
    /* the asset is already gone, unreachable, or not ours to delete */
  }
};
