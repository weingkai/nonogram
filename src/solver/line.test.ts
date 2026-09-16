import { describe, expect, it } from 'vitest';
import { leftmostPacking, minLength, rightmostPacking, solveLine } from './line';
import { EMPTY, FILLED, UNKNOWN } from './types';

const line = (spec: string) =>
  Int8Array.from([...spec].map((ch) => (ch === '#' ? FILLED : ch === '.' ? EMPTY : UNKNOWN)));

const show = (cells: Int8Array) =>
  [...cells].map((v) => (v === FILLED ? '#' : v === EMPTY ? '.' : '?')).join('');

describe('solveLine', () => {
  it('finds the classic overlap', () => {
    // A block of 3 in 5 cells must cover the middle cell.
    expect(show(solveLine(line('?????'), [3])!.cells)).toBe('??#??');
  });

  it('solves a fully determined line', () => {
    expect(show(solveLine(line('?????'), [5])!.cells)).toBe('#####');
    expect(show(solveLine(line('?????'), [2, 2])!.cells)).toBe('##.##');
  });

  it('marks a blank line empty', () => {
    expect(show(solveLine(line('?????'), [])!.cells)).toBe('.....');
    expect(show(solveLine(line('?????'), [0])!.cells)).toBe('.....');
  });

  it('crosses out cells once every block is placed', () => {
    expect(show(solveLine(line('?#???'), [1])!.cells)).toBe('.#...');
  });

  it('uses existing empties to pin a block down', () => {
    expect(show(solveLine(line('?.???'), [3])!.cells)).toBe('..###');
  });

  it('extends a partial block', () => {
    // The block of 4 must cover cell 2, so it starts at 0, 1 or 2 — cells 2 and 3 are
    // in every case, and cells 6-8 are out of reach.
    expect(show(solveLine(line('??#??????'), [4])!.cells)).toBe('??##??...');
  });

  it('leaves genuinely ambiguous cells unknown', () => {
    expect(show(solveLine(line('????'), [1])!.cells)).toBe('????');
  });

  it('reports contradictions', () => {
    expect(solveLine(line('????'), [5])).toBeNull();
    expect(solveLine(line('#..#'), [3])).toBeNull();
    expect(solveLine(line('#.#.'), [1])).toBeNull();
  });

  it('is idempotent', () => {
    const once = solveLine(line('??????????'), [3, 4])!;
    const twice = solveLine(once.cells, [3, 4])!;
    expect(twice.changed).toBe(false);
    expect(show(twice.cells)).toBe(show(once.cells));
  });
});

describe('packings', () => {
  it('pushes blocks to each edge', () => {
    expect(leftmostPacking(line('??????'), [2, 2])).toEqual([0, 3]);
    expect(rightmostPacking(line('??????'), [2, 2])).toEqual([1, 4]);
  });

  it('respects known cells', () => {
    expect(leftmostPacking(line('.?????'), [3])).toEqual([1]);
    expect(rightmostPacking(line('?????.'), [3])).toEqual([2]);
  });
});

describe('minLength', () => {
  it('accounts for the gaps between blocks', () => {
    expect(minLength([])).toBe(0);
    expect(minLength([3])).toBe(3);
    expect(minLength([3, 1, 2])).toBe(8);
  });
});
