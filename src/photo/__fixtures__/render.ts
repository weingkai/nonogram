import { boxBlur, grayFrom, type GrayImage, type Rect } from '../image';
import { drawNumber, numberHeight, numberWidth } from './font';
import { normaliseClues } from '../../solver/line';
import type { Puzzle } from '../../solver/types';

/**
 * Draws a nonogram the way a screenshot of one looks: a ruled grid with clue numbers in
 * bands above and to the left. Digits are stand-in ink blobs — the geometry stages only
 * care that clue ink is small and grid lines are long, and OCR is stubbed in tests.
 */
export interface RenderOptions {
  cell?: number;
  lineWidth?: number;
  majorLineWidth?: number;
  margin?: number;
  ink?: number;
  background?: number;
  /** Draw separators between clue slots, as many printed puzzles do. */
  ruledClueBands?: boolean;
  /**
   * Draw real readable digits instead of plain blobs. Slower and larger, but needed to
   * put OCR itself under test.
   */
  digitScale?: number;
  /** Soften edges by this radius, standing in for anti-aliased rendering. */
  antialias?: number;
}

export interface ClueBlob {
  axis: 'row' | 'col';
  line: number;
  order: number;
  value: number;
  box: Rect;
}

export interface Rendered {
  gray: GrayImage;
  /** True grid bounds and line positions, for asserting against detection. */
  grid: Rect;
  xs: number[];
  ys: number[];
  cell: number;
  blobs: ClueBlob[];
}

function fillRect(img: GrayImage, x: number, y: number, w: number, h: number, value: number) {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(img.width, Math.round(x + w));
  const y1 = Math.min(img.height, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) img.data[yy * img.width + xx] = value;
  }
}

export function renderPuzzle(puzzle: Puzzle, options: RenderOptions = {}): Rendered {
  const cell = options.cell ?? 20;
  const line = options.lineWidth ?? 1;
  const major = options.majorLineWidth ?? 2;
  const margin = options.margin ?? 10;
  const ink = options.ink ?? 20;
  const background = options.background ?? 245;

  const rows = puzzle.rows.map(normaliseClues);
  const cols = puzzle.cols.map(normaliseClues);
  const rowDepth = Math.max(1, ...rows.map((c) => c.length));
  const colDepth = Math.max(1, ...cols.map((c) => c.length));

  const rowBand = rowDepth * cell;
  const colBand = colDepth * cell;
  const gridX = margin + rowBand;
  const gridY = margin + colBand;
  const gridW = puzzle.width * cell;
  const gridH = puzzle.height * cell;

  const img = grayFrom(gridX + gridW + margin, gridY + gridH + margin, background);

  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= puzzle.width; i++) {
    const thickness = i % 5 === 0 ? major : line;
    const x = gridX + i * cell - Math.floor(thickness / 2);
    fillRect(img, x, gridY, thickness, gridH, ink);
    xs.push(gridX + i * cell);
  }
  for (let j = 0; j <= puzzle.height; j++) {
    const thickness = j % 5 === 0 ? major : line;
    const y = gridY + j * cell - Math.floor(thickness / 2);
    fillRect(img, gridX, y, gridW, thickness, ink);
    ys.push(gridY + j * cell);
  }

  if (options.ruledClueBands) {
    // Vertical separators inside the row-clue band, and horizontal ones in the column band.
    for (let k = 0; k <= rowDepth; k++) {
      fillRect(img, margin + k * cell, gridY, line, gridH, ink);
    }
    for (let k = 0; k <= colDepth; k++) {
      fillRect(img, gridX, margin + k * cell, gridW, line, ink);
    }
  }

  // Clue numbers: readable digits when asked for, otherwise digit-sized blobs.
  const blobs: ClueBlob[] = [];
  const scale = options.digitScale;

  const place = (value: number, slotX: number, slotY: number): Rect => {
    const text = String(value);
    const w = scale ? numberWidth(text, scale) : Math.round(cell * 0.42);
    const h = scale ? numberHeight(scale) : Math.round(cell * 0.6);
    const box: Rect = {
      x: Math.round(slotX + (cell - w) / 2),
      y: Math.round(slotY + (cell - h) / 2),
      width: w,
      height: h,
    };
    if (scale) drawNumber(img, text, box.x, box.y, scale, ink);
    else fillRect(img, box.x, box.y, box.width, box.height, ink);
    return box;
  };

  rows.forEach((clues, r) => {
    clues.forEach((value, k) => {
      const slot = clues.length - 1 - k; // 0 = nearest the grid
      const box = place(value, gridX - (slot + 1) * cell, gridY + r * cell);
      blobs.push({ axis: 'row', line: r, order: k, value, box });
    });
  });

  cols.forEach((clues, c) => {
    clues.forEach((value, k) => {
      const slot = clues.length - 1 - k;
      const box = place(value, gridX + c * cell, gridY - (slot + 1) * cell);
      blobs.push({ axis: 'col', line: c, order: k, value, box });
    });
  });

  return {
    gray: options.antialias ? boxBlur(img, options.antialias) : img,
    grid: { x: gridX, y: gridY, width: gridW, height: gridH },
    xs,
    ys,
    cell,
    blobs,
  };
}

/** Multiplies in a smooth brightness gradient, as a scanner lamp or a shadow would. */
export function applyIlluminationGradient(img: GrayImage, strength = 0.55): GrayImage {
  const out = new Uint8ClampedArray(img.data.length);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const fx = x / Math.max(1, img.width - 1);
      const fy = y / Math.max(1, img.height - 1);
      const factor = 1 - strength * (0.6 * fx + 0.4 * fy);
      out[y * img.width + x] = img.data[y * img.width + x] * factor;
    }
  }
  return { width: img.width, height: img.height, data: out };
}

/** Salt-and-pepper style speckle, deterministic so tests stay stable. */
export function addNoise(img: GrayImage, amount = 0.02, seed = 1): GrayImage {
  let state = seed;
  const rand = () => ((state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out = Uint8ClampedArray.from(img.data);
  for (let i = 0; i < out.length; i++) {
    if (rand() < amount) out[i] = rand() < 0.5 ? 0 : 255;
  }
  return { width: img.width, height: img.height, data: out };
}
