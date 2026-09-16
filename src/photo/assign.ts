import { normaliseClues } from '../solver/line';
import type { Puzzle } from '../solver/types';
import type { Rect } from './image';
import type { Lattice } from './lattice';

/** One digit tesseract found, in the coordinate space of the whole prepared image. */
export interface RecognisedSymbol {
  text: string;
  /** 0–100, as tesseract reports it. */
  confidence: number;
  box: Rect;
}

export interface LineReading {
  clues: number[];
  /** Lowest confidence among the words read for this line; 100 when it read nothing. */
  confidence: number;
  /** Set when something about the reading looks wrong. */
  note?: string;
}

export interface Reading {
  puzzle: Puzzle;
  rows: LineReading[];
  cols: LineReading[];
  /** Numbers that landed outside every clue line — a sign the grid was misread. */
  strays: number;
}

/** Below this, a clue is worth a second look from the user. */
export const CONFIDENCE_FLOOR = 70;

const centre = (box: Rect) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/**
 * Turns the digits found in each clue line into clue lists.
 *
 * Symbols arrive already grouped by line, because each line's strip is cropped and read
 * separately — a digit cannot land in the wrong row. What is left is which clue within
 * the line each digit belongs to, and the lattice answers that: clue bands are ruled to
 * the same pitch as the grid, so a digit's clue follows from how many cells back from
 * the grid edge it sits. Digits sharing a cell are one number, read left to right.
 */
export function assignLines(
  lattice: Lattice,
  rowLines: RecognisedSymbol[][],
  colLines: RecognisedSymbol[][],
): Reading {
  const pitchX = lattice.grid.width / lattice.width;
  const pitchY = lattice.grid.height / lattice.height;

  const rows = rowLines.map((symbols) => readLine(symbols, lattice.grid.x, pitchX, 'x'));
  const cols = colLines.map((symbols) => readLine(symbols, lattice.grid.y, pitchY, 'y'));

  return {
    puzzle: {
      width: lattice.width,
      height: lattice.height,
      rows: rows.map((r) => r.reading.clues),
      cols: cols.map((c) => c.reading.clues),
    },
    rows: rows.map((r) => r.reading),
    cols: cols.map((c) => c.reading),
    strays: [...rows, ...cols].reduce((total, line) => total + line.strays, 0),
  };
}

function readLine(
  symbols: RecognisedSymbol[],
  gridEdge: number,
  pitch: number,
  axis: 'x' | 'y',
): { reading: LineReading; strays: number } {
  /** Cells back from the grid edge: 0 is nearest the grid. */
  const cells = new Map<number, RecognisedSymbol[]>();
  let strays = 0;

  for (const symbol of symbols) {
    const c = centre(symbol.box);
    const slot = Math.floor((gridEdge - (axis === 'x' ? c.x : c.y)) / pitch);
    if (slot < 0) {
      strays++;
      continue;
    }
    const cell = cells.get(slot) ?? [];
    cell.push(symbol);
    cells.set(slot, cell);
  }

  // Furthest from the grid is read first, as clue lists run outward-in.
  const ordered = [...cells.entries()].sort(([a], [b]) => b - a);

  const clues: number[] = [];
  let confidence = 100;
  let unreadable = 0;

  for (const [, cell] of ordered) {
    const digits = cell
      .sort((a, b) => a.box.x - b.box.x)
      .map((s) => s.text.replace(/\D/g, ''))
      .join('');
    const value = Number(digits);
    if (!digits || !Number.isSafeInteger(value) || value <= 0) {
      unreadable++;
      continue;
    }
    clues.push(value);
    for (const symbol of cell) confidence = Math.min(confidence, symbol.confidence);
  }

  const notes: string[] = [];
  if (unreadable > 0) notes.push(`${unreadable} mark${unreadable > 1 ? 's' : ''} unreadable`);
  if (confidence < CONFIDENCE_FLOOR) notes.push('low confidence');

  return {
    reading: {
      clues: normaliseClues(clues),
      confidence: ordered.length === 0 ? 100 : confidence,
      note: notes.length ? notes.join(', ') : undefined,
    },
    strays,
  };
}

/** Keys like `"row-3"` for the lines the user should check before solving. */
export function uncertainLines(reading: Reading): Set<string> {
  const keys = new Set<string>();
  reading.rows.forEach((r, i) => {
    if (r.note) keys.add(`row-${i}`);
  });
  reading.cols.forEach((c, i) => {
    if (c.note) keys.add(`col-${i}`);
  });
  return keys;
}
