import type { BinaryImage, GrayImage } from './image';

/** Rotates about the image centre, sampling bilinearly, on a white background. */
export function rotateGray(img: GrayImage, radians: number): GrayImage {
  const { width: w, height: h, data } = img;
  const out = new Uint8ClampedArray(w * h);
  out.fill(255);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;

  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      // Inverse-map the destination pixel back into the source.
      const sx = cx + dx * cos + dy * sin;
      const sy = cy - dx * sin + dy * cos;
      if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) continue;

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(w - 1, x0 + 1);
      const y1 = Math.min(h - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const top = data[y0 * w + x0] * (1 - fx) + data[y0 * w + x1] * fx;
      const bottom = data[y1 * w + x0] * (1 - fx) + data[y1 * w + x1] * fx;
      out[y * w + x] = top * (1 - fy) + bottom * fy;
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Variance of the ink-per-row profile at a given rotation. Grid rules pile all their ink
 * into a handful of rows when the image is level, and smear it across many when it is
 * not — so this peaks at the true skew angle.
 */
function projectionSharpness(ink: Int32Array, xs: Int32Array, ys: Int32Array, radians: number, height: number): number {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const buckets = new Float64Array(height);
  for (let i = 0; i < ink.length; i++) {
    const y = Math.round(-xs[i] * sin + ys[i] * cos);
    if (y >= 0 && y < height) buckets[y]++;
  }
  let mean = 0;
  for (const v of buckets) mean += v;
  mean /= buckets.length;
  let variance = 0;
  for (const v of buckets) variance += (v - mean) ** 2;
  return variance / buckets.length;
}

export interface DeskewResult {
  radians: number;
  degrees: number;
}

/**
 * Estimates a small page rotation by searching for the angle whose horizontal ink
 * projection is sharpest. Coarse pass then a fine pass around the winner.
 */
export function estimateSkew(img: BinaryImage, maxDegrees = 4, step = 0.25): DeskewResult {
  const { width: w, height: h, data } = img;

  // Subsample the ink; the profile is a statistic and does not need every pixel.
  const xs: number[] = [];
  const ys: number[] = [];
  const stride = Math.max(1, Math.round(Math.sqrt((w * h) / 120_000)));
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  for (let y = 0; y < h; y += stride) {
    const row = y * w;
    for (let x = 0; x < w; x += stride) {
      if (data[row + x]) {
        xs.push(x - cx);
        ys.push(y - cy);
      }
    }
  }
  if (xs.length < 50) return { radians: 0, degrees: 0 };

  const ink = new Int32Array(xs.length);
  const xArr = Int32Array.from(xs);
  const yArr = Int32Array.from(ys);

  let best = 0;
  let bestScore = -1;
  for (let degrees = -maxDegrees; degrees <= maxDegrees; degrees += step) {
    const radians = (degrees * Math.PI) / 180;
    const score = projectionSharpness(ink, xArr, yArr, radians, h);
    if (score > bestScore) {
      bestScore = score;
      best = radians;
    }
  }
  return { radians: best, degrees: (best * 180) / Math.PI };
}

/** Rotation below this is not worth the resampling blur. */
export const SKEW_DEADBAND_DEGREES = 0.2;

export function deskew(gray: GrayImage, binary: BinaryImage): { gray: GrayImage; degrees: number } {
  const { radians, degrees } = estimateSkew(binary);
  if (Math.abs(degrees) < SKEW_DEADBAND_DEGREES) return { gray, degrees: 0 };
  return { gray: rotateGray(gray, -radians), degrees };
}
