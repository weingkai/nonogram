import type { Rect } from './image';
import type { Lattice } from './lattice';

export interface ClueBands {
  /** Everything left of the grid, spanning the grid's rows. */
  row: Rect;
  /** Everything above the grid, spanning the grid's columns. */
  col: Rect;
}

/**
 * The clue bands fall straight out of the lattice: row clues sit left of the first
 * vertical line, column clues above the first horizontal one, and both share the grid's
 * line positions — so no separate segmentation is needed to tell which clue belongs to
 * which line.
 */
export function clueBands(lattice: Lattice): ClueBands {
  const { grid } = lattice;
  return {
    row: { x: 0, y: grid.y, width: Math.max(0, grid.x), height: grid.height },
    col: { x: grid.x, y: 0, width: grid.width, height: Math.max(0, grid.y) },
  };
}

export interface ClueLineStrips {
  /** One strip per row, left of the grid, in row order. */
  rows: Rect[];
  /** One strip per column, above the grid, in column order. */
  cols: Rect[];
}

/**
 * Splits the clue bands into one strip per clue line. Each strip is handed to OCR on its
 * own, which is both what tesseract reads most reliably and what makes it impossible for
 * a digit to be attributed to the wrong line.
 */
export function clueLineStrips(lattice: Lattice): ClueLineStrips {
  const { grid, xs, ys } = lattice;
  return {
    rows: ys.slice(0, -1).map((y, i) => ({
      x: 0,
      y,
      width: Math.max(0, grid.x),
      height: ys[i + 1] - y,
    })),
    cols: xs.slice(0, -1).map((x, i) => ({
      x,
      y: 0,
      width: xs[i + 1] - x,
      height: Math.max(0, grid.y),
    })),
  };
}
