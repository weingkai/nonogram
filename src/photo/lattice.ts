import type { BinaryImage, Rect } from './image';

export interface Lattice {
  /** Vertical line positions, `width + 1` of them, left to right. */
  xs: number[];
  /** Horizontal line positions, `height + 1` of them, top to bottom. */
  ys: number[];
  width: number;
  height: number;
  grid: Rect;
}

export interface LatticeFailure {
  ok: false;
  reason: string;
}

export type LatticeResult = ({ ok: true } & Lattice) | LatticeFailure;

/**
 * Longest run of ink in each column, bridging gaps of up to `gapTolerance` pixels.
 *
 * The tolerance matters: a thin rule is easily broken by speckle, JPEG ringing or
 * anti-aliasing, and a strictly unbroken run would rate such a line no higher than a
 * digit stroke.
 */
export function longestVerticalRuns(img: BinaryImage, gapTolerance = 2): Int32Array {
  const { width: w, height: h, data } = img;
  const best = new Int32Array(w);
  const run = new Int32Array(w);
  const gap = new Int32Array(w);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (data[row + x]) {
        if (run[x] > 0 && gap[x] > 0) run[x] += gap[x];
        gap[x] = 0;
        run[x]++;
        if (run[x] > best[x]) best[x] = run[x];
      } else if (run[x] > 0 && ++gap[x] > gapTolerance) {
        run[x] = 0;
        gap[x] = 0;
      }
    }
  }
  return best;
}

/** Longest run of ink in each row, with the same gap tolerance. */
export function longestHorizontalRuns(img: BinaryImage, gapTolerance = 2): Int32Array {
  const { width: w, height: h, data } = img;
  const best = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let run = 0;
    let gap = 0;
    for (let x = 0; x < w; x++) {
      if (data[row + x]) {
        if (run > 0 && gap > 0) run += gap;
        gap = 0;
        run++;
        if (run > best[y]) best[y] = run;
      } else if (run > 0 && ++gap > gapTolerance) {
        run = 0;
        gap = 0;
      }
    }
  }
  return best;
}

/**
 * Groups adjacent above-threshold indices into one position each — a drawn line is
 * several pixels thick, and thick "every fifth" rules are thicker still.
 */
export function clusterPeaks(runs: Int32Array, threshold: number, maxGap = 1): number[] {
  const positions: number[] = [];
  let start = -1;
  let last = -1;
  const flush = () => {
    if (start >= 0) positions.push((start + last) / 2);
  };
  for (let i = 0; i < runs.length; i++) {
    if (runs[i] >= threshold) {
      if (start < 0 || i - last > maxGap) {
        flush();
        start = i;
      }
      last = i;
    }
  }
  flush();
  return positions;
}

/**
 * Merges positions that sit far closer together than the grid's pitch.
 *
 * Puzzles commonly draw a heavier rule every five cells right beside the ordinary one,
 * and a photo resolves the pair as two peaks a few pixels apart. Left alone that tiny gap
 * is not a whole number of cells, so it breaks the uniform fit and the grid comes back
 * truncated.
 */
export function mergeClosePeaks(positions: number[], factor = 0.4): number[] {
  if (positions.length < 3) return positions;

  const gaps: number[] = [];
  for (let i = 1; i < positions.length; i++) gaps.push(positions[i] - positions[i - 1]);
  const limit = median(gaps) * factor;
  if (!(limit > 0)) return positions;

  const merged: number[] = [];
  let cluster = [positions[0]];
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] - positions[i - 1] < limit) {
      cluster.push(positions[i]);
    } else {
      merged.push(cluster.reduce((a, b) => a + b, 0) / cluster.length);
      cluster = [positions[i]];
    }
  }
  merged.push(cluster.reduce((a, b) => a + b, 0) / cluster.length);
  return merged;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface UniformFit {
  positions: number[];
  pitch: number;
}

/**
 * Finds the longest evenly spaced run inside `positions` and rebuilds it at an exact
 * pitch. This does two jobs at once: faint interior lines that were missed come back
 * (a gap of ~2·pitch is filled in), and strays like an outer border around the whole
 * page get dropped because they break the progression.
 */
export function fitUniform(positions: number[], tolerance = 0.3): UniformFit | null {
  if (positions.length < 3) return null;

  const gaps: number[] = [];
  for (let i = 1; i < positions.length; i++) gaps.push(positions[i] - positions[i - 1]);
  const pitch = median(gaps);
  if (!(pitch > 2)) return null;

  let bestStart = 0;
  let bestEnd = 0;
  let start = 0;
  for (let i = 1; i < positions.length; i++) {
    const gap = positions[i] - positions[i - 1];
    const steps = Math.round(gap / pitch);
    const consistent = steps >= 1 && steps <= 3 && Math.abs(gap - steps * pitch) <= tolerance * pitch;
    if (!consistent) {
      start = i;
      continue;
    }
    if (positions[i] - positions[start] > positions[bestEnd] - positions[bestStart]) {
      bestStart = start;
      bestEnd = i;
    }
  }

  const span = positions[bestEnd] - positions[bestStart];
  if (span <= 0) return null;
  const count = Math.round(span / pitch);
  if (count < 2) return null;

  const exact = span / count;
  const first = positions[bestStart];
  return {
    positions: Array.from({ length: count + 1 }, (_, i) => first + i * exact),
    pitch: exact,
  };
}

export interface LatticeOptions {
  /** Fraction of the longest run a line must reach to count as one. */
  runFraction?: number;
  minCells?: number;
  maxCells?: number;
  /** How different the horizontal and vertical pitches may be. Cells are near-square. */
  pitchTolerance?: number;
}

/**
 * Locates the puzzle's grid by its ruling. Grid lines produce an ink run nearly as long
 * as the grid itself, while clue digits produce runs a fraction of a cell long — so a
 * simple longest-run threshold separates the two cleanly.
 */
export function detectLattice(img: BinaryImage, options: LatticeOptions = {}): LatticeResult {
  const runFraction = options.runFraction ?? 0.5;
  const minCells = options.minCells ?? 2;
  const maxCells = options.maxCells ?? 80;
  const pitchTolerance = options.pitchTolerance ?? 0.35;

  const vertical = longestVerticalRuns(img);
  const horizontal = longestHorizontalRuns(img);
  const maxVertical = Math.max(...vertical);
  const maxHorizontal = Math.max(...horizontal);

  if (maxVertical < 8 || maxHorizontal < 8) {
    return { ok: false, reason: 'No grid lines found — is this a picture of a nonogram?' };
  }

  const xs = fitUniform(mergeClosePeaks(clusterPeaks(vertical, maxVertical * runFraction)));
  const ys = fitUniform(mergeClosePeaks(clusterPeaks(horizontal, maxHorizontal * runFraction)));
  if (!xs || !ys) {
    return { ok: false, reason: 'Could not make out an evenly ruled grid.' };
  }

  const full: Lattice = {
    xs: xs.positions,
    ys: ys.positions,
    width: xs.positions.length - 1,
    height: ys.positions.length - 1,
    grid: {
      x: xs.positions[0],
      y: ys.positions[0],
      width: xs.positions.at(-1)! - xs.positions[0],
      height: ys.positions.at(-1)! - ys.positions[0],
    },
  };
  const lattice = trimToGrid(img, full);
  const { width, height } = lattice;

  if (width < minCells || height < minCells) {
    return { ok: false, reason: `Detected only ${width}×${height} cells.` };
  }
  if (width > maxCells || height > maxCells) {
    return { ok: false, reason: `Detected an implausible ${width}×${height} grid.` };
  }

  const ratio = xs.pitch / ys.pitch;
  if (Math.abs(ratio - 1) > pitchTolerance) {
    return {
      ok: false,
      reason: 'The rows and columns are spaced too differently to be one grid.',
    };
  }

  return { ok: true, ...lattice };
}

/**
 * Trims clue bands off a detected lattice.
 *
 * Detection keys on long ruled lines, so when a puzzle rules its clue bands like a table
 * those separators come back as extra rows and columns. The grid proper is the one region
 * with no *interior* ink — clue cells hold digits, grid cells are empty — so we take the
 * largest bottom-right block of cells whose interiors are blank. That is where the grid
 * sits relative to its clue bands by definition.
 *
 * Assumes an unsolved puzzle. If the grid is already partly filled in, no block is blank
 * and the lattice is returned untouched.
 */
export function trimToGrid(img: BinaryImage, lattice: Lattice, inset = 0.25): Lattice {
  const { xs, ys, width: w, height: h } = lattice;

  const hasInk = (i: number, j: number): boolean => {
    const padX = (xs[i + 1] - xs[i]) * inset;
    const padY = (ys[j + 1] - ys[j]) * inset;
    const x0 = Math.max(0, Math.ceil(xs[i] + padX));
    const x1 = Math.min(img.width, Math.floor(xs[i + 1] - padX));
    const y0 = Math.max(0, Math.ceil(ys[j] + padY));
    const y1 = Math.min(img.height, Math.floor(ys[j + 1] - padY));
    const area = (x1 - x0) * (y1 - y0);
    if (area <= 0) return false;
    let ink = 0;
    for (let y = y0; y < y1; y++) {
      const row = y * img.width;
      for (let x = x0; x < x1; x++) ink += img.data[row + x];
    }
    return ink / area > 0.08;
  };

  // blank[i][j] = no ink anywhere in the block from (i, j) to the bottom-right corner.
  const blank: boolean[][] = Array.from({ length: w + 1 }, () => new Array(h + 1).fill(true));
  for (let i = w - 1; i >= 0; i--) {
    for (let j = h - 1; j >= 0; j--) {
      blank[i][j] = !hasInk(i, j) && blank[i + 1][j] && blank[i][j + 1];
    }
  }

  let bestI = 0;
  let bestJ = 0;
  let bestArea = -1;
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      if (!blank[i][j]) continue;
      const area = (w - i) * (h - j);
      if (area > bestArea) {
        bestArea = area;
        bestI = i;
        bestJ = j;
      }
    }
  }
  if (bestArea <= 0) return lattice;

  const trimmedXs = xs.slice(bestI);
  const trimmedYs = ys.slice(bestJ);
  return {
    xs: trimmedXs,
    ys: trimmedYs,
    width: trimmedXs.length - 1,
    height: trimmedYs.length - 1,
    grid: {
      x: trimmedXs[0],
      y: trimmedYs[0],
      width: trimmedXs.at(-1)! - trimmedXs[0],
      height: trimmedYs.at(-1)! - trimmedYs[0],
    },
  };
}

/** Rebuilds a lattice at a size the user has corrected by hand. */
export function latticeOfSize(grid: Rect, width: number, height: number): Lattice {
  const xs = Array.from({ length: width + 1 }, (_, i) => grid.x + (i * grid.width) / width);
  const ys = Array.from({ length: height + 1 }, (_, i) => grid.y + (i * grid.height) / height);
  return { xs, ys, width, height, grid };
}
