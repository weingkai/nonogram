import { EMPTY, FILLED, UNKNOWN } from './types';

/**
 * Line-complete solver for a single row or column.
 *
 * Models every legal arrangement of `clues` within `cells` as paths through a DAG of
 * states `(i, j)` — "clues `i..` still to place, starting at cell `j`". A state is *live*
 * when it is both reachable from the start and able to reach the accept state `(k, n)`.
 * Walking the live transitions tells us, for every cell, whether it can be filled and
 * whether it can be empty; a cell with only one option is forced.
 */

export interface LineSolution {
  /** Updated line. Same contents as the input when nothing new was deduced. */
  cells: Int8Array;
  changed: boolean;
  /** Per cell: is there a legal arrangement with this cell filled / empty? */
  canFilled: Uint8Array;
  canEmpty: Uint8Array;
}

/** Normalises `[0]` (a conventional "blank line" clue) to `[]`. */
export function normaliseClues(clues: number[]): number[] {
  return clues.filter((n) => n > 0);
}

/** Smallest line length the clues can possibly occupy. */
export function minLength(clues: number[]): number {
  const c = normaliseClues(clues);
  if (c.length === 0) return 0;
  return c.reduce((a, b) => a + b, 0) + c.length - 1;
}

/** Returns `null` if the clues cannot be satisfied by the current cell states. */
export function solveLine(cells: Int8Array, clueList: number[]): LineSolution | null {
  const n = cells.length;
  const clues = normaliseClues(clueList);
  const k = clues.length;
  const W = n + 1;

  // End position of clue `i` placed at `j`, or -1 if that placement is illegal.
  // Returns the destination `j` of the transition (packed into the caller's bookkeeping).
  const blockEnd = (i: number, j: number): number => {
    const end = j + clues[i];
    if (end > n) return -1;
    for (let x = j; x < end; x++) if (cells[x] === EMPTY) return -1;
    if (end < n && cells[end] === FILLED) return -1;
    return end;
  };
  const destOf = (end: number) => (end < n ? end + 1 : n);

  const bwd = new Uint8Array((k + 1) * W);
  bwd[k * W + n] = 1;
  for (let j = n; j >= 0; j--) {
    for (let i = k; i >= 0; i--) {
      if (i === k && j === n) continue;
      let live = 0;
      if (j < n && cells[j] !== FILLED && bwd[i * W + j + 1]) live = 1;
      if (!live && i < k && j < n) {
        const end = blockEnd(i, j);
        if (end >= 0 && bwd[(i + 1) * W + destOf(end)]) live = 1;
      }
      bwd[i * W + j] = live;
    }
  }
  if (!bwd[0]) return null;

  const fwd = new Uint8Array((k + 1) * W);
  fwd[0] = 1;
  const canFilled = new Uint8Array(n);
  const canEmpty = new Uint8Array(n);

  for (let j = 0; j < n; j++) {
    for (let i = 0; i <= k; i++) {
      if (!fwd[i * W + j] || !bwd[i * W + j]) continue;
      if (cells[j] !== FILLED && bwd[i * W + j + 1]) {
        fwd[i * W + j + 1] = 1;
        canEmpty[j] = 1;
      }
      if (i < k) {
        const end = blockEnd(i, j);
        if (end >= 0) {
          const dest = destOf(end);
          if (bwd[(i + 1) * W + dest]) {
            fwd[(i + 1) * W + dest] = 1;
            for (let x = j; x < end; x++) canFilled[x] = 1;
            if (end < n) canEmpty[end] = 1;
          }
        }
      }
    }
  }

  const out = Int8Array.from(cells);
  let changed = false;
  for (let p = 0; p < n; p++) {
    const f = canFilled[p];
    const e = canEmpty[p];
    if (!f && !e) return null;
    const forced = f && !e ? FILLED : !f && e ? EMPTY : UNKNOWN;
    if (forced !== UNKNOWN && out[p] !== forced) {
      out[p] = forced;
      changed = true;
    }
  }
  return { cells: out, changed, canFilled, canEmpty };
}

/**
 * Start positions of each block when every block is pushed as far left as the current
 * cell states allow. `null` if the line is already contradictory.
 */
export function leftmostPacking(cells: Int8Array, clueList: number[]): number[] | null {
  const n = cells.length;
  const clues = normaliseClues(clueList);
  const k = clues.length;
  const W = n + 1;

  const blockEnd = (i: number, j: number): number => {
    const end = j + clues[i];
    if (end > n) return -1;
    for (let x = j; x < end; x++) if (cells[x] === EMPTY) return -1;
    if (end < n && cells[end] === FILLED) return -1;
    return end;
  };
  const destOf = (end: number) => (end < n ? end + 1 : n);

  const bwd = new Uint8Array((k + 1) * W);
  bwd[k * W + n] = 1;
  for (let j = n; j >= 0; j--) {
    for (let i = k; i >= 0; i--) {
      if (i === k && j === n) continue;
      let live = 0;
      if (j < n && cells[j] !== FILLED && bwd[i * W + j + 1]) live = 1;
      if (!live && i < k && j < n) {
        const end = blockEnd(i, j);
        if (end >= 0 && bwd[(i + 1) * W + destOf(end)]) live = 1;
      }
      bwd[i * W + j] = live;
    }
  }
  if (!bwd[0]) return null;

  const positions: number[] = [];
  let i = 0;
  let j = 0;
  while (i < k) {
    const end = blockEnd(i, j);
    if (end >= 0 && bwd[(i + 1) * W + destOf(end)]) {
      positions.push(j);
      j = destOf(end);
      i++;
    } else {
      j++;
    }
  }
  return positions;
}

/** Mirror image of {@link leftmostPacking}: every block pushed as far right as possible. */
export function rightmostPacking(cells: Int8Array, clueList: number[]): number[] | null {
  const n = cells.length;
  const clues = normaliseClues(clueList);
  const flipped = Int8Array.from(cells).reverse();
  const packed = leftmostPacking(flipped, [...clues].reverse());
  if (!packed) return null;
  // Un-mirror: block `i` of the reversed line is block `k-1-i` of the original.
  const out: number[] = [];
  for (let i = packed.length - 1; i >= 0; i--) {
    const len = clues[packed.length - 1 - i];
    out.push(n - packed[i] - len);
  }
  return out;
}
