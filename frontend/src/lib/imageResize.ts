// ─────────────────────────────────────────────────────────────────────────────
// src/lib/imageResize.ts
// Downscale an image file to a small square data URL, in the browser.
//
// This exists because avatars are stored as data URLs on the user document —
// there's no S3 or Cloudinary configured. Sending a 4MB phone photo would be
// rejected by the 200KB server cap, so the client shrinks it first. A 256×256
// JPEG at q0.82 lands around 15-25KB.
// ─────────────────────────────────────────────────────────────────────────────

export interface ResizeOptions {
  /** Output edge length in px. The result is always square. */
  size?: number;
  /** JPEG quality, 0-1. Ignored for PNG output. */
  quality?: number;
  /** PNG preserves transparency — right for logos, wasteful for photos. */
  mimeType?: 'image/jpeg' | 'image/png';
}

export class ImageResizeError extends Error {}

/**
 * Read a File, centre-crop it to a square, scale to `size`, and return a data
 * URL. Rejects with a human-readable message rather than a DOM event.
 */
export function resizeImageToDataUrl(
  file: File,
  { size = 256, quality = 0.82, mimeType = 'image/jpeg' }: ResizeOptions = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new ImageResizeError('That file isn’t an image.'));
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();

    // Revoke in both paths — an object URL held open pins the whole file in
        // memory for the life of the document.
    const cleanup = () => URL.revokeObjectURL(url);

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new ImageResizeError('Your browser blocked image processing.');

        // Centre crop: take the largest square that fits, then scale it. Simply
        // stretching to a square would squash every non-square photo.
        const edge = Math.min(img.width, img.height);
        const sx = (img.width - edge) / 2;
        const sy = (img.height - edge) / 2;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // JPEG has no alpha, so an unpainted canvas renders transparent pixels
        // as black. Fill white first.
        if (mimeType === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, size, size);
        }

        ctx.drawImage(img, sx, sy, edge, edge, 0, 0, size, size);
        resolve(canvas.toDataURL(mimeType, quality));
      } catch (err) {
        reject(err instanceof Error ? err : new ImageResizeError('Could not process that image.'));
      } finally {
        cleanup();
      }
    };

    img.onerror = () => {
      cleanup();
      reject(new ImageResizeError('That image couldn’t be read — it may be corrupt.'));
    };

    img.src = url;
  });
}

/** Rough decoded byte count of a data URL, for pre-flight size checks. */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((base64.length * 3) / 4);
}
