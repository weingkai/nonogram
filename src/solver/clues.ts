import { minLength, normaliseClues } from './line';
import type { Puzzle } from './types';

/** Parses free text like "3 1 2", "3,1,2" or "312" (single digits) into a clue list. */
export function parseClues(text: string): number[] | null {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  const tokens = trimmed.split(/[\s,.;]+/).filter(Boolean);
  const out: number[] = [];
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) return null;
    const n = Number(token);
    if (!Number.isSafeInteger(n) || n < 0) return null;
    if (n > 0) out.push(n);
  }
  return out;
}

export function formatClues(clues: number[]): string {
  return clues.join(' ');
}

export interface PuzzleProblem {
  axis: 'row' | 'col' | 'puzzle';
  index: number;
  message: string;
}

/** Structural checks that are cheap and worth showing before the solver runs. */
export function validatePuzzle(puzzle: Puzzle): PuzzleProblem[] {
  const problems: PuzzleProblem[] = [];
  const { width, height, rows, cols } = puzzle;

  rows.forEach((clues, i) => {
    const need = minLength(clues);
    if (need > width) {
      problems.push({
        axis: 'row',
        index: i,
        message: `Row ${i + 1} needs at least ${need} cells but the grid is ${width} wide.`,
      });
    }
  });
  cols.forEach((clues, i) => {
    const need = minLength(clues);
    if (need > height) {
      problems.push({
        axis: 'col',
        index: i,
        message: `Column ${i + 1} needs at least ${need} cells but the grid is ${height} tall.`,
      });
    }
  });

  const sum = (lists: number[][]) =>
    lists.reduce((acc, clues) => acc + normaliseClues(clues).reduce((a, b) => a + b, 0), 0);
  const rowTotal = sum(rows);
  const colTotal = sum(cols);
  if (rowTotal !== colTotal) {
    problems.push({
      axis: 'puzzle',
      index: -1,
      message: `Row clues total ${rowTotal} filled cells but column clues total ${colTotal}.`,
    });
  }

  return problems;
}

/** Derives the clue lists implied by a solved grid — handy for tests and sample puzzles. */
export function cluesFromGrid(grid: readonly number[][], filled = 1): Puzzle {
  const height = grid.length;
  const width = height > 0 ? grid[0].length : 0;
  const runs = (line: number[]) => {
    const out: number[] = [];
    let run = 0;
    for (const v of line) {
      if (v === filled) run++;
      else if (run > 0) {
        out.push(run);
        run = 0;
      }
    }
    if (run > 0) out.push(run);
    return out;
  };
  const rows = grid.map((row) => runs([...row]));
  const cols: number[][] = [];
  for (let c = 0; c < width; c++) cols.push(runs(grid.map((row) => row[c])));
  return { width, height, rows, cols };
}
