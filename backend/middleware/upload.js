import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import multer from 'multer';
import sharp from 'sharp';
import { BadRequestError } from '../errors/customErrors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = path.join(__dirname, '..', 'public', 'media');

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

const messageMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
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
    cb(new BadRequestError('Unexpected upload field'));
  },
}).fields([
  { name: 'image', maxCount: 1 },
  { name: 'audio', maxCount: 1 },
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
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  await fs.writeFile(path.join(MEDIA_DIR, name), output.data);

  return {
    url: `/media/${name}`,
    width: output.info.width,
    height: output.info.height,
  };
};
