/**
 * Turn a camera photo (or picked image) into a small square fabric swatch:
 * center-cropped, downscaled, and JPEG-compressed on-device so it fits
 * comfortably inside the quilt's saved data.
 */
import { LIMITS } from '../shared/quilt';

const SWATCH_PX = 256;

export async function processFabricPhoto(file: File): Promise<string> {
  const bitmap = await loadBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    if (side < 1) throw new Error('empty image');
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = SWATCH_PX;
    canvas.height = SWATCH_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas context');
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SWATCH_PX, SWATCH_PX);
    // Step quality down until the swatch fits the per-fabric budget.
    for (const quality of [0.82, 0.6, 0.4]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= LIMITS.maxImageChars) return dataUrl;
    }
    throw new Error('image will not compress');
  } finally {
    bitmap.close?.();
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    // Fallback for formats createImageBitmap can't take directly from a Blob.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
