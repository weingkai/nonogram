/** A single cell's state. Numeric so grids can be flat Int8Arrays. */
export const UNKNOWN = 0;
export const FILLED = 1;
export const EMPTY = 2;

export type CellState = typeof UNKNOWN | typeof FILLED | typeof EMPTY;

export type Axis = 'row' | 'col';

export interface Puzzle {
  width: number;
  height: number;
  /** One clue list per row, top to bottom. An empty array means "all blank". */
  rows: number[][];
  /** One clue list per column, left to right. */
  cols: number[][];
}

/** Row-major grid of cell states, `width * height` long. */
export type Grid = Int8Array;

export interface CellChange {
  r: number;
  c: number;
  value: CellState;
}

export type Technique = 'overlap' | 'unreachable' | 'completion' | 'line-analysis';

export type StepKind =
  | 'deduction'
  | 'guess'
  | 'backtrack'
  | 'contradiction'
  | 'done'
  | 'aborted';

export interface LineRef {
  axis: Axis;
  index: number;
  clues: number[];
}

export interface SolverStep {
  kind: StepKind;
  line?: LineRef;
  changes: CellChange[];
  technique?: Technique;
  message: string;
}

export type SolveOutcome = 'solved' | 'unsolvable' | 'aborted';

export interface SolveResult {
  outcome: SolveOutcome;
  steps: SolverStep[];
  /** Final grid when `outcome === 'solved'`, otherwise the furthest state reached. */
  grid: Grid;
  elapsedMs: number;
}

export const idx = (width: number, r: number, c: number) => r * width + c;

export function emptyGrid(width: number, height: number): Grid {
  return new Int8Array(width * height);
}
