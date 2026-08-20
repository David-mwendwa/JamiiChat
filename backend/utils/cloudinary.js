import cloudinary from 'cloudinary';

// Configuring with an empty api_key is harmless — every call below is only
// reached after `isCloudinaryConfigured()` gates it in `middleware/upload.js`
// — so this can run unconditionally at import time rather than needing its
// own lazy-init dance.
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const isCloudinaryConfigured = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );

/**
 * Upload an already-decoded buffer to Cloudinary.
 *
 * Takes a `Buffer` directly via `upload_stream` rather than a base64 data URI
 * — every caller here already has a `Buffer` (sharp's `processImage` output,
 * or a raw voice-note recording), and round-tripping that through base64
 * first only costs ~33% more bytes over the wire for no benefit once nothing
 * downstream needs a string.
 *
 * @param {Buffer} buffer
 * @param {object} [options] - Cloudinary upload options (`folder`,
 *   `public_id`, `resource_type`, etc).
 * @returns {Promise<object>} Cloudinary's upload result.
 */
export const uploadBuffer = (buffer, options = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.v2.uploader.upload_stream(
      { resource_type: 'auto', ...options },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(buffer);
  });

/**
 * Remove an asset from Cloudinary by its public ID.
 *
 * @param {string} publicId
 * @param {object} [options] - e.g. `{ resource_type: 'video' }` for audio.
 */
export const removeFromCloudinary = async (publicId, options = {}) => {
  if (!publicId) return null;
  return cloudinary.v2.uploader.destroy(publicId, { resource_type: 'image', ...options });
};
