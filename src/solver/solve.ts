import { leftmostPacking, normaliseClues, rightmostPacking, solveLine } from './line';
import {
  EMPTY,
  FILLED,
  UNKNOWN,
  emptyGrid,
  idx,
  type Axis,
  type CellChange,
  type CellState,
  type Grid,
  type Puzzle,
  type SolveResult,
  type SolverStep,
  type Technique,
} from './types';

export interface SolveOptions {
  /** Hard cap on line-solver invocations, so a pathological puzzle can't hang the tab. */
  maxLineSolves?: number;
  timeBudgetMs?: number;
}

const DEFAULT_OPTIONS: Required<SolveOptions> = {
  maxLineSolves: 200_000,
  timeBudgetMs: 10_000,
};

class Budget {
  private count = 0;
  private readonly start = performance.now();
  exhausted = false;
  private readonly opts: Required<SolveOptions>;
  constructor(opts: Required<SolveOptions>) {
    this.opts = opts;
  }
  /** True while there is budget left. */
  tick(): boolean {
    if (this.exhausted) return false;
    this.count++;
    if (this.count > this.opts.maxLineSolves) this.exhausted = true;
    else if (this.count % 512 === 0 && performance.now() - this.start > this.opts.timeBudgetMs) {
      this.exhausted = true;
    }
    return !this.exhausted;
  }
  get elapsedMs() {
    return performance.now() - this.start;
  }
}

interface Context {
  puzzle: Puzzle;
  grid: Grid;
  budget: Budget;
}

/** Line keys: `0 .. height-1` are rows, `height .. height+width-1` are columns. */
const rowKey = (i: number) => i;
const colKey = (p: Puzzle, j: number) => p.height + j;

function lineOf(ctx: Context, key: number): { axis: Axis; index: number; clues: number[] } {
  const { puzzle } = ctx;
  return key < puzzle.height
    ? { axis: 'row', index: key, clues: puzzle.rows[key] ?? [] }
    : { axis: 'col', index: key - puzzle.height, clues: puzzle.cols[key - puzzle.height] ?? [] };
}

function readLine(ctx: Context, axis: Axis, index: number): Int8Array {
  const { puzzle, grid } = ctx;
  if (axis === 'row') {
    const out = new Int8Array(puzzle.width);
    for (let c = 0; c < puzzle.width; c++) out[c] = grid[idx(puzzle.width, index, c)];
    return out;
  }
  const out = new Int8Array(puzzle.height);
  for (let r = 0; r < puzzle.height; r++) out[r] = grid[idx(puzzle.width, r, index)];
  return out;
}

const cellOf = (axis: Axis, index: number, p: number) =>
  axis === 'row' ? { r: index, c: p } : { r: p, c: index };

/** Collapses `[2,3,4,7]` into `"3–5, 8"` (switching to 1-based positions for humans). */
function ranges(positions: number[]): string {
  if (positions.length === 0) return '';
  const parts: string[] = [];
  let start = positions[0];
  let prev = positions[0];
  const flush = () => parts.push(start === prev ? `${start + 1}` : `${start + 1}–${prev + 1}`);
  for (const p of positions.slice(1)) {
    if (p === prev + 1) prev = p;
    else {
      flush();
      start = p;
      prev = p;
    }
  }
  flush();
  return parts.join(', ');
}

/**
 * Works out *why* a line's deductions hold, purely for the reasoning log. The solving
 * itself is done by {@link solveLine}; this just puts a readable name on the result.
 */
function describe(
  axis: Axis,
  index: number,
  clueList: number[],
  before: Int8Array,
  filledAt: number[],
  emptyAt: number[],
): { technique: Technique; message: string } {
  const clues = normaliseClues(clueList);
  const label = `${axis === 'row' ? 'Row' : 'Column'} ${index + 1} [${clues.length ? clues.join(' ') : '0'}]`;

  let filledTechnique: Technique = 'line-analysis';
  if (filledAt.length > 0) {
    const left = leftmostPacking(before, clues);
    const right = rightmostPacking(before, clues);
    if (left && right && left.length === clues.length) {
      const overlap = new Set<number>();
      for (let i = 0; i < clues.length; i++) {
        for (let p = Math.max(left[i], right[i]); p < Math.min(left[i], right[i]) + clues[i]; p++) {
          overlap.add(p);
        }
      }
      if (filledAt.every((p) => overlap.has(p))) filledTechnique = 'overlap';
    }
  }

  let emptyTechnique: Technique = 'unreachable';
  if (emptyAt.length > 0) {
    const total = clues.reduce((a, b) => a + b, 0);
    let already = 0;
    for (const v of before) if (v === FILLED) already++;
    if (already === total && total > 0) emptyTechnique = 'completion';
  }

  const reason: Record<Technique, string> = {
    overlap: 'every placement overlaps here',
    unreachable: 'no block can reach these',
    completion: 'all blocks are already placed',
    'line-analysis': 'forced by the remaining arrangements',
  };

  const parts: string[] = [];
  if (filledAt.length) parts.push(`fill ${ranges(filledAt)} (${reason[filledTechnique]})`);
  if (emptyAt.length) parts.push(`cross out ${ranges(emptyAt)} (${reason[emptyTechnique]})`);

  return {
    technique: filledAt.length ? filledTechnique : emptyTechnique,
    message: `${label}: ${parts.join('; ')}`,
  };
}

/** Runs the dirty-line queue to a fixpoint. Returns false on contradiction or budget end. */
function* propagate(ctx: Context, seed: number[]): Generator<SolverStep, boolean> {
  const { puzzle } = ctx;
  const total = puzzle.height + puzzle.width;
  const queued = new Uint8Array(total);
  const queue: number[] = [];
  for (const key of seed) {
    if (!queued[key]) {
      queued[key] = 1;
      queue.push(key);
    }
  }

  for (let head = 0; head < queue.length; head++) {
    const key = queue[head];
    queued[key] = 0;
    if (!ctx.budget.tick()) return false;

    const { axis, index, clues } = lineOf(ctx, key);
    const before = readLine(ctx, axis, index);
    const solution = solveLine(before, clues);

    if (!solution) {
      yield {
        kind: 'contradiction',
        line: { axis, index, clues: normaliseClues(clues) },
        changes: [],
        message: `${axis === 'row' ? 'Row' : 'Column'} ${index + 1} cannot be satisfied — backing up.`,
      };
      return false;
    }
    if (!solution.changed) continue;

    const changes: CellChange[] = [];
    const filledAt: number[] = [];
    const emptyAt: number[] = [];
    for (let p = 0; p < before.length; p++) {
      if (solution.cells[p] === before[p]) continue;
      const { r, c } = cellOf(axis, index, p);
      const value = solution.cells[p] as CellState;
      ctx.grid[idx(puzzle.width, r, c)] = value;
      changes.push({ r, c, value });
      (value === FILLED ? filledAt : emptyAt).push(p);

      const crossing = axis === 'row' ? colKey(puzzle, c) : rowKey(r);
      if (!queued[crossing]) {
        queued[crossing] = 1;
        queue.push(crossing);
      }
    }

    const { technique, message } = describe(axis, index, clues, before, filledAt, emptyAt);
    yield {
      kind: 'deduction',
      line: { axis, index, clues: normaliseClues(clues) },
      changes,
      technique,
      message,
    };
  }
  return true;
}

/** The unknown cell in the most-constrained line — the cheapest place to branch. */
function pickBranchCell(ctx: Context): { r: number; c: number } | null {
  const { puzzle } = ctx;
  let best: { r: number; c: number } | null = null;
  let bestUnknown = Infinity;

  const consider = (axis: Axis, index: number) => {
    const line = readLine(ctx, axis, index);
    let unknown = 0;
    let first = -1;
    for (let p = 0; p < line.length; p++) {
      if (line[p] === UNKNOWN) {
        unknown++;
        if (first < 0) first = p;
      }
    }
    if (unknown > 0 && unknown < bestUnknown) {
      bestUnknown = unknown;
      best = cellOf(axis, index, first);
    }
  };

  for (let r = 0; r < puzzle.height; r++) consider('row', r);
  for (let c = 0; c < puzzle.width; c++) consider('col', c);
  return best;
}

const isComplete = (ctx: Context) => !ctx.grid.includes(UNKNOWN);

function* search(ctx: Context, seed: number[]): Generator<SolverStep, boolean> {
  if (!(yield* propagate(ctx, seed))) return false;
  if (ctx.budget.exhausted) return false;
  if (isComplete(ctx)) return true;

  const cell = pickBranchCell(ctx);
  if (!cell) return false;
  const { puzzle } = ctx;

  for (const guess of [FILLED, EMPTY] as CellState[]) {
    const snapshot = Int8Array.from(ctx.grid);
    ctx.grid[idx(puzzle.width, cell.r, cell.c)] = guess;
    yield {
      kind: 'guess',
      changes: [{ r: cell.r, c: cell.c, value: guess }],
      message: `No forced move left — trying R${cell.r + 1}C${cell.c + 1} as ${
        guess === FILLED ? 'filled' : 'empty'
      }.`,
    };

    if (yield* search(ctx, [rowKey(cell.r), colKey(puzzle, cell.c)])) return true;
    if (ctx.budget.exhausted) return false;

    const undo: CellChange[] = [];
    for (let r = 0; r < puzzle.height; r++) {
      for (let c = 0; c < puzzle.width; c++) {
        const i = idx(puzzle.width, r, c);
        if (ctx.grid[i] !== snapshot[i]) undo.push({ r, c, value: snapshot[i] as CellState });
      }
    }
    ctx.grid.set(snapshot);
    yield {
      kind: 'backtrack',
      changes: undo,
      message: `That led nowhere — undoing the guess at R${cell.r + 1}C${cell.c + 1}.`,
    };
  }
  return false;
}

/** Streams the solve as a sequence of steps. */
export function* solve(puzzle: Puzzle, options: SolveOptions = {}): Generator<SolverStep, void> {
  const budget = new Budget({ ...DEFAULT_OPTIONS, ...options });
  const ctx: Context = { puzzle, grid: emptyGrid(puzzle.width, puzzle.height), budget };

  const seed: number[] = [];
  for (let r = 0; r < puzzle.height; r++) seed.push(rowKey(r));
  for (let c = 0; c < puzzle.width; c++) seed.push(colKey(puzzle, c));

  const solved = yield* search(ctx, seed);
  if (solved) {
    yield { kind: 'done', changes: [], message: 'Solved — every cell is determined.' };
  } else if (budget.exhausted) {
    yield {
      kind: 'aborted',
      changes: [],
      message: 'Gave up: this puzzle exceeded the search budget.',
    };
  } else {
    yield {
      kind: 'contradiction',
      changes: [],
      message: 'No solution exists for these clues.',
    };
  }
}

/** Runs the solver to completion and returns every step plus the final grid. */
export function solveAll(puzzle: Puzzle, options: SolveOptions = {}): SolveResult {
  const started = performance.now();
  const steps: SolverStep[] = [];
  for (const step of solve(puzzle, options)) steps.push(step);

  const grid = applySteps(puzzle, steps, steps.length);
  const last = steps[steps.length - 1];
  const outcome =
    last?.kind === 'done' ? 'solved' : last?.kind === 'aborted' ? 'aborted' : 'unsolvable';

  return { outcome, steps, grid, elapsedMs: performance.now() - started };
}

/** Replays the first `count` steps onto a blank grid. Used for scrubbing the timeline. */
export function applySteps(puzzle: Puzzle, steps: SolverStep[], count: number): Grid {
  const grid = emptyGrid(puzzle.width, puzzle.height);
  for (let i = 0; i < Math.min(count, steps.length); i++) {
    for (const { r, c, value } of steps[i].changes) grid[idx(puzzle.width, r, c)] = value;
  }
  return grid;
}
