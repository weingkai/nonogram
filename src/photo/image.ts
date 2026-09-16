/** Single-channel 8-bit image, 0 = black. */
export interface GrayImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Binary mask where 1 = ink (dark). */
export interface BinaryImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function grayFrom(width: number, height: number, fill = 255): GrayImage {
  const data = new Uint8ClampedArray(width * height);
  data.fill(fill);
  return { width, height, data };
}

/** Rec. 601 luma; alpha is composited over white so transparent PNGs behave. */
export function toGray(image: ImageData): GrayImage {
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    const a = data[p + 3] / 255;
    const r = data[p] * a + 255 * (1 - a);
    const g = data[p + 1] * a + 255 * (1 - a);
    const b = data[p + 2] * a + 255 * (1 - a);
    out[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return { width, height, data: out };
}

/**
 * Summed-area table, `(width + 1) * (height + 1)`, so any rectangle's total is four
 * lookups. Used for both the box blur and area-averaged downscaling.
 */
export function integralImage(img: GrayImage): Float64Array {
  const { width: w, height: h, data } = img;
  const stride = w + 1;
  const ii = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += data[y * w + x];
      ii[(y + 1) * stride + x + 1] = ii[y * stride + x + 1] + rowSum;
    }
  }
  return ii;
}

/** Mean of the source rectangle `[x0,x1) × [y0,y1)`, clamped to the image. */
function areaMean(
  ii: Float64Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const ax = Math.max(0, Math.min(w, x0));
  const ay = Math.max(0, Math.min(h, y0));
  const bx = Math.max(0, Math.min(w, x1));
  const by = Math.max(0, Math.min(h, y1));
  const area = (bx - ax) * (by - ay);
  if (area <= 0) return 0;
  const stride = w + 1;
  const sum =
    ii[by * stride + bx] - ii[ay * stride + bx] - ii[by * stride + ax] + ii[ay * stride + ax];
  return sum / area;
}

export function boxBlur(img: GrayImage, radius: number): GrayImage {
  const { width: w, height: h } = img;
  const r = Math.max(1, Math.round(radius));
  const ii = integralImage(img);
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[y * w + x] = areaMean(ii, w, h, x - r, y - r, x + r + 1, y + r + 1);
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Divides out a heavily blurred copy of the image, which removes page shading, vignetting
 * and soft shadows while leaving thin ink strokes intact. Background lands near 255.
 */
export function flattenIllumination(img: GrayImage, radius?: number): GrayImage {
  const r = radius ?? Math.max(8, Math.round(Math.max(img.width, img.height) / 16));
  const background = boxBlur(img, r);
  const out = new Uint8ClampedArray(img.width * img.height);
  for (let i = 0; i < out.length; i++) {
    out[i] = (255 * img.data[i]) / Math.max(1, background.data[i]);
  }
  return { width: img.width, height: img.height, data: out };
}

/** Otsu's method: the threshold maximising between-class variance. */
export function otsuThreshold(img: GrayImage): number {
  const histogram = new Float64Array(256);
  for (const v of img.data) histogram[v]++;
  const total = img.data.length;

  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * histogram[t];

  let sumBackground = 0;
  let weightBackground = 0;
  let best = 0;
  let bestVariance = -1;

  for (let t = 0; t < 256; t++) {
    weightBackground += histogram[t];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += t * histogram[t];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance =
      weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = t;
    }
  }
  return best;
}

/** Pixels at or below `threshold` become ink. */
export function binarize(img: GrayImage, threshold: number): BinaryImage {
  const data = new Uint8Array(img.width * img.height);
  for (let i = 0; i < data.length; i++) data[i] = img.data[i] <= threshold ? 1 : 0;
  return { width: img.width, height: img.height, data };
}

/** Area-averaged downscale. Returns the original when it already fits. */
export function downscale(img: GrayImage, maxSide: number): GrayImage {
  const longest = Math.max(img.width, img.height);
  if (longest <= maxSide) return img;

  const scale = maxSide / longest;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const ii = integralImage(img);
  const out = new Uint8ClampedArray(w * h);
  const sx = img.width / w;
  const sy = img.height / h;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[y * w + x] = areaMean(ii, img.width, img.height, x * sx, y * sy, (x + 1) * sx, (y + 1) * sy);
    }
  }
  return { width: w, height: h, data: out };
}

/** Bounding box of all ink, or null when the mask is empty. */
export function inkBounds(img: BinaryImage): Rect | null {
  const { width: w, height: h, data } = img;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!data[y * w + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function cropBinary(img: BinaryImage, rect: Rect): BinaryImage {
  const data = new Uint8Array(rect.width * rect.height);
  for (let y = 0; y < rect.height; y++) {
    const srcRow = (rect.y + y) * img.width;
    for (let x = 0; x < rect.width; x++) {
      data[y * rect.width + x] = img.data[srcRow + rect.x + x];
    }
  }
  return { width: rect.width, height: rect.height, data };
}
