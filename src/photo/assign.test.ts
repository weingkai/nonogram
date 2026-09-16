import { describe, expect, it } from 'vitest';
import { assignLines, uncertainLines, type RecognisedSymbol } from './assign';
import { latticeOfSize } from './lattice';

// Grid at (200,120), 4×4 cells of 50×40. That leaves four clue slots to the left and
// three above, which is room enough to exercise ordering.
const lattice = latticeOfSize({ x: 200, y: 120, width: 200, height: 160 }, 4, 4);
const PITCH_X = 50;
const PITCH_Y = 40;

const at = (text: string, x: number, y: number, confidence = 95): RecognisedSymbol => ({
  text,
  confidence,
  box: { x: x - 5, y: y - 7, width: 10, height: 14 },
});

/** A digit in row `line`, `slot` cells left of the grid; `nudge` orders digits in a cell. */
const rowDigit = (text: string, line: number, slot: number, nudge = 0, confidence = 95) =>
  at(text, 200 - slot * PITCH_X - PITCH_X / 2 + nudge, 120 + line * PITCH_Y + PITCH_Y / 2, confidence);

/** A digit in column `line`, `slot` cells above the grid. */
const colDigit = (text: string, line: number, slot: number, nudge = 0, confidence = 95) =>
  at(text, 200 + line * PITCH_X + PITCH_X / 2 + nudge, 120 - slot * PITCH_Y - PITCH_Y / 2, confidence);

/** Packs loose digits into the per-line arrays `assignLines` expects. */
const lines = (count: number, entries: [number, RecognisedSymbol][]) => {
  const out: RecognisedSymbol[][] = Array.from({ length: count }, () => []);
  for (const [line, symbol] of entries) out[line].push(symbol);
  return out;
};

describe('assignSymbols', () => {
  it('keeps each line’s clues with that line', () => {
    const reading = assignLines(
      lattice,
      lines(4, [[0, rowDigit('3', 0, 0)], [1, rowDigit('1', 1, 0)], [3, rowDigit('5', 3, 0)]]),
      lines(4, [[0, colDigit('2', 0, 0)], [3, colDigit('4', 3, 0)]]),
    );
    expect(reading.puzzle.rows).toEqual([[3], [1], [], [5]]);
    expect(reading.puzzle.cols).toEqual([[2], [], [], [4]]);
  });

  it('reads clue lists outward-in', () => {
    const reading = assignLines(
      lattice,
      lines(4, [[0, rowDigit('2', 0, 0)], [0, rowDigit('7', 0, 2)], [0, rowDigit('1', 0, 1)]]),
      lines(4, [[0, colDigit('9', 0, 0)], [0, colDigit('6', 0, 2)], [0, colDigit('8', 0, 1)]]),
    );
    expect(reading.puzzle.rows[0]).toEqual([7, 1, 2]);
    expect(reading.puzzle.cols[0]).toEqual([6, 8, 9]);
  });

  it('joins digits sharing a cell into one number', () => {
    const reading = assignLines(
      lattice,
      lines(4, [[0, rowDigit('1', 0, 0, -6)], [0, rowDigit('2', 0, 0, 6)]]),
      lines(4, [[0, colDigit('3', 0, 0, -6)], [0, colDigit('0', 0, 0, 6)]]),
    );
    expect(reading.puzzle.rows[0]).toEqual([12]);
    expect(reading.puzzle.cols[0]).toEqual([30]);
  });

  it('keeps neighbouring clues apart even when they nearly touch', () => {
    // The case that defeats grouping by proximity: "10" and "1" in adjacent cells read
    // as the single number 101 if you trust tesseract's word boundaries.
    const reading = assignLines(
      lattice,
      lines(4, [
        [0, rowDigit('1', 0, 1, -8)],
        [0, rowDigit('0', 0, 1, 8)],
        [0, rowDigit('1', 0, 0, -18)],
      ]),
      lines(4, []),
    );
    expect(reading.puzzle.rows[0]).toEqual([10, 1]);
  });

  it('flags a line read with low confidence', () => {
    const reading = assignLines(lattice, lines(4, [[0, rowDigit('3', 0, 0, 0, 41)]]), lines(4, []));
    expect(reading.rows[0].clues).toEqual([3]);
    expect(reading.rows[0].note).toMatch(/low confidence/);
    expect(uncertainLines(reading).has('row-0')).toBe(true);
  });

  it('flags a cell it could not turn into a number, and drops it', () => {
    const reading = assignLines(
      lattice,
      lines(4, [[0, rowDigit('3', 0, 1)], [0, rowDigit('~', 0, 0)]]),
      lines(4, []),
    );
    expect(reading.rows[0].clues).toEqual([3]);
    expect(reading.rows[0].note).toMatch(/unreadable/);
  });

  it('discards a zero rather than trusting it', () => {
    const reading = assignLines(lattice, lines(4, [[0, rowDigit('0', 0, 0)]]), lines(4, []));
    expect(reading.rows[0].clues).toEqual([]);
    expect(reading.rows[0].note).toMatch(/unreadable/);
  });

  it('counts digits that stray past the grid edge', () => {
    const reading = assignLines(
      lattice,
      lines(4, [[0, at('9', 260, 140)], [0, rowDigit('4', 0, 0)]]),
      lines(4, []),
    );
    // x=260 is inside the grid, so it belongs to no clue cell.
    expect(reading.strays).toBe(1);
    expect(reading.puzzle.rows[0]).toEqual([4]);
  });

  it('leaves an empty line unflagged — a blank clue is a real answer', () => {
    const reading = assignLines(lattice, lines(4, []), lines(4, []));
    expect(reading.rows.every((r: { note?: string }) => r.note === undefined)).toBe(true);
    expect(uncertainLines(reading).size).toBe(0);
  });
});
