import { describe, expect, it } from 'vitest';
import { SAMPLES, artToCells, samplePuzzle, sampleNamed } from '../samples';
import { cluesFromGrid, parseClues, validatePuzzle } from './clues';
import { applySteps, solveAll } from './solve';
import { FILLED, idx, type Grid, type Puzzle } from './types';

const render = (puzzle: Puzzle, grid: Grid) => {
  const out: string[] = [];
  for (let r = 0; r < puzzle.height; r++) {
    let row = '';
    for (let c = 0; c < puzzle.width; c++) {
      row += grid[idx(puzzle.width, r, c)] === FILLED ? '#' : '.';
    }
    out.push(row);
  }
  return out;
};

describe('sample puzzles', () => {
  it.each(SAMPLES)('solves $name back to its picture', (sample) => {
    const puzzle = samplePuzzle(sample);
    expect(validatePuzzle(puzzle)).toEqual([]);

    const result = solveAll(puzzle);
    expect(result.outcome).toBe('solved');
    expect(render(puzzle, result.grid)).toEqual(sample.art);
  });

  it.each(SAMPLES)('$name replays step by step to the same grid', (sample) => {
    const puzzle = samplePuzzle(sample);
    const result = solveAll(puzzle);
    const replayed = applySteps(puzzle, result.steps, result.steps.length);
    expect([...replayed]).toEqual([...result.grid]);
    // Every intermediate replay must be a prefix-consistent state, never throwing.
    for (let i = 0; i <= result.steps.length; i++) {
      expect(applySteps(puzzle, result.steps, i).length).toBe(puzzle.width * puzzle.height);
    }
  });
});

describe('solveAll', () => {
  it('reports puzzles with no solution', () => {
    // Rows want two filled cells, columns want three — impossible.
    const puzzle: Puzzle = { width: 3, height: 3, rows: [[1], [1], []], cols: [[1], [1], [1]] };
    expect(solveAll(puzzle).outcome).toBe('unsolvable');
  });

  it('detects clues that cannot fit at all', () => {
    const puzzle: Puzzle = { width: 3, height: 1, rows: [[2, 2]], cols: [[1], [1], [1]] };
    expect(solveAll(puzzle).outcome).toBe('unsolvable');
  });

  it('returns one valid grid for an ambiguous puzzle, via a guess', () => {
    // Two diagonals both satisfy "one filled cell per row and column".
    const puzzle: Puzzle = { width: 2, height: 2, rows: [[1], [1]], cols: [[1], [1]] };
    const result = solveAll(puzzle);
    expect(result.outcome).toBe('solved');
    expect(result.steps.some((s) => s.kind === 'guess')).toBe(true);
    // Whatever it picked must genuinely satisfy the clues.
    const derived = cluesFromGrid(artToCells(render(puzzle, result.grid)));
    expect(derived.rows).toEqual(puzzle.rows);
    expect(derived.cols).toEqual(puzzle.cols);
  });

  it('solves a blank puzzle', () => {
    const puzzle: Puzzle = { width: 3, height: 2, rows: [[], []], cols: [[], [], []] };
    const result = solveAll(puzzle);
    expect(result.outcome).toBe('solved');
    expect(render(puzzle, result.grid)).toEqual(['...', '...']);
  });

  it('logs a reason for every deduction', () => {
    const result = solveAll(samplePuzzle(sampleNamed('Heart')));
    for (const step of result.steps) {
      expect(step.message.length).toBeGreaterThan(0);
      if (step.kind === 'deduction') expect(step.technique).toBeDefined();
    }
  });
});

describe('parseClues', () => {
  it('accepts the formats a person would actually type', () => {
    expect(parseClues('3 1 2')).toEqual([3, 1, 2]);
    expect(parseClues(' 3,1 , 2 ')).toEqual([3, 1, 2]);
    expect(parseClues('')).toEqual([]);
    expect(parseClues('0')).toEqual([]);
  });

  it('rejects junk', () => {
    expect(parseClues('3 x')).toBeNull();
    expect(parseClues('-1')).toBeNull();
  });
});

describe('validatePuzzle', () => {
  it('flags clues that do not fit', () => {
    const problems = validatePuzzle({ width: 4, height: 1, rows: [[2, 2]], cols: [[1], [1], [1], [1]] });
    expect(problems.some((p) => p.axis === 'row')).toBe(true);
  });

  it('flags mismatched totals', () => {
    const problems = validatePuzzle({ width: 2, height: 2, rows: [[2], [2]], cols: [[1], [1]] });
    expect(problems.some((p) => p.axis === 'puzzle')).toBe(true);
  });
});
