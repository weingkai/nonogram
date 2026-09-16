import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cluesFromGrid, validatePuzzle } from './clues';
import { solveAll } from './solve';
import { FILLED, idx, type Puzzle } from './types';

/**
 * "No. 009" — a 15×15 puzzle transcribed from a photo of a screen.
 */
const PUZZLE_009: Puzzle = {
  width: 15,
  height: 15,
  rows: [
    [6, 6],
    [4, 3, 4],
    [3, 7, 3],
    [2, 1, 1, 1, 1, 2],
    [1, 1, 3, 1, 1, 1],
    [1, 1, 2, 3, 1, 1],
    [2, 1, 2, 2],
    [2, 2],
    [2, 3],
    [1, 2, 3, 1],
    [1, 1, 1, 1, 1],
    [2, 1, 2, 1, 1, 2],
    [3, 2, 3, 3],
    [4, 3, 4],
    [6, 6],
  ],
  cols: [
    [6, 6],
    [4, 3, 4],
    [3, 7, 3],
    [2, 1, 1, 1, 2],
    [1, 1, 2, 1, 1, 1],
    [1, 5, 2, 1],
    [2, 1, 1, 1],
    [2, 1],
    [2, 2, 3],
    [1, 5, 1, 1],
    [1, 1, 1, 1, 1, 1],
    [2, 1, 2, 1, 2],
    [3, 7, 3],
    [4, 3, 4],
    [6, 6],
  ],
};

const render = (puzzle: Puzzle, grid: Int8Array) =>
  Array.from({ length: puzzle.height }, (_, r) =>
    Array.from({ length: puzzle.width }, (_, c) =>
      grid[idx(puzzle.width, r, c)] === FILLED ? '#' : '.',
    ).join(''),
  );

describe('puzzle No. 009', () => {
  it('has clues that add up', () => {
    expect(validatePuzzle(PUZZLE_009)).toEqual([]);
  });

  it('solves by pure logic, with no guessing', () => {
    const result = solveAll(PUZZLE_009);
    writeFileSync(
      '/private/tmp/claude-501/-Users-kai-Code-nonogram/e7a6b870-5ac8-4f0c-b72d-c0db61ae8cf0/scratchpad/picture.txt',
      [
        `${result.outcome} — ${result.steps.length} steps, ${result.elapsedMs.toFixed(1)}ms, ` +
          `${result.steps.filter((s) => s.kind === 'guess').length} guesses`,
        ...render(PUZZLE_009, result.grid),
      ].join('\n'),
    );

    expect(result.outcome).toBe('solved');
    // No guesses means every cell was forced, which also proves the solution is unique.
    expect(result.steps.filter((s) => s.kind === 'guess')).toEqual([]);
  });

  it('reproduces its own clues from the solved grid', () => {
    const result = solveAll(PUZZLE_009);
    const derived = cluesFromGrid(
      render(PUZZLE_009, result.grid).map((row) => [...row].map((ch) => (ch === '#' ? 1 : 0))),
    );
    expect(derived.rows).toEqual(PUZZLE_009.rows);
    expect(derived.cols).toEqual(PUZZLE_009.cols);
  });
});
