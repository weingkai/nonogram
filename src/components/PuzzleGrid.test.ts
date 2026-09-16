import { describe, expect, it } from 'vitest';
import { gridMetrics } from './gridMetrics';

const total = (m: ReturnType<typeof gridMetrics>, width: number) => m.rowHeader + width * m.cell;

describe('gridMetrics', () => {
  it('uses the largest comfortable cell when there is room', () => {
    const m = gridMetrics(620, 9, 2, 2);
    expect(m.cell).toBe(32);
    expect(total(m, 9)).toBeLessThanOrEqual(620);
  });

  it.each([
    ['phone', 343, 15, 4, 4],
    ['small phone', 303, 10, 3, 3],
    ['tablet', 700, 20, 5, 5],
  ])('fits a %s viewport', (_name, available, width, rowDepth, colDepth) => {
    const m = gridMetrics(available, width, rowDepth, colDepth);
    expect(total(m, width)).toBeLessThanOrEqual(available);
    expect(m.cell).toBeGreaterThanOrEqual(13);
  });

  it('shrinks rather than overflowing as the viewport narrows', () => {
    const wide = gridMetrics(900, 15, 3, 3);
    const narrow = gridMetrics(343, 15, 3, 3);
    expect(narrow.cell).toBeLessThan(wide.cell);
    expect(narrow.clueFont).toBeLessThanOrEqual(wide.clueFont);
  });

  it('stops shrinking at a legible floor and lets the grid scroll instead', () => {
    const m = gridMetrics(300, 40, 6, 6);
    expect(m.cell).toBe(13);
    expect(m.clueFont).toBeGreaterThanOrEqual(9);
    expect(total(m, 40)).toBeGreaterThan(300); // i.e. it scrolls sideways
  });

  it('gives deeper clue lists bigger headers', () => {
    expect(gridMetrics(620, 10, 5, 5).rowHeader).toBeGreaterThan(
      gridMetrics(620, 10, 1, 1).rowHeader,
    );
    expect(gridMetrics(620, 10, 5, 5).colHeader).toBeGreaterThan(
      gridMetrics(620, 10, 1, 1).colHeader,
    );
  });
});
