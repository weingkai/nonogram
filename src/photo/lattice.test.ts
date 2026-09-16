import { describe, expect, it } from 'vitest';
import { SAMPLES, samplePuzzle, sampleNamed } from '../samples';
import { binarize, flattenIllumination, otsuThreshold, type BinaryImage, type GrayImage } from './image';
import { clusterPeaks, detectLattice, fitUniform, latticeOfSize } from './lattice';
import { addNoise, applyIlluminationGradient, renderPuzzle, type RenderOptions } from './__fixtures__/render';
import type { Puzzle } from '../solver/types';

const prepare = (
  puzzle: Puzzle,
  options: RenderOptions = {},
  mangle: (g: GrayImage) => GrayImage = (g) => g,
) => {
  const rendered = renderPuzzle(puzzle, options);
  const flat = flattenIllumination(mangle(rendered.gray));
  const binary: BinaryImage = binarize(flat, otsuThreshold(flat));
  return { rendered, binary };
};

describe('fitUniform', () => {
  it('rebuilds an exact pitch from slightly noisy positions', () => {
    const fit = fitUniform([10, 19.6, 30.3, 40, 49.8]);
    expect(fit).not.toBeNull();
    expect(fit!.pitch).toBeCloseTo(9.95, 1);
    expect(fit!.positions).toHaveLength(5);
  });

  it('fills in a line that was missed', () => {
    // The line at 30 is absent; the 20-wide gap must be read as two steps.
    const fit = fitUniform([10, 20, 40, 50, 60]);
    expect(fit!.positions).toHaveLength(6);
    expect(fit!.positions[2]).toBeCloseTo(30, 5);
  });

  it('drops a stray far from the progression, such as a page border', () => {
    const fit = fitUniform([2, 100, 110, 120, 130, 140]);
    expect(fit!.positions[0]).toBeCloseTo(100, 5);
    expect(fit!.positions).toHaveLength(5);
  });

  it('refuses a set with no regular spacing', () => {
    expect(fitUniform([1, 40, 43, 900])).toBeNull();
    expect(fitUniform([5, 10])).toBeNull();
  });
});

describe('clusterPeaks', () => {
  it('collapses a thick line into one position', () => {
    const runs = Int32Array.from([0, 0, 9, 9, 9, 0, 0, 8, 0, 0]);
    expect(clusterPeaks(runs, 5)).toEqual([3, 7]);
  });
});

describe('detectLattice', () => {
  it.each(SAMPLES)('finds the grid of $name', (sample) => {
    const puzzle = samplePuzzle(sample);
    const { rendered, binary } = prepare(puzzle);
    const result = detectLattice(binary);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([result.width, result.height]).toEqual([puzzle.width, puzzle.height]);
    // Thick "every fifth" rules sit half a pixel off the thin ones, so allow ~1px.
    expect(Math.abs(result.grid.x - rendered.grid.x)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(result.grid.y - rendered.grid.y)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(result.xs[0] - rendered.xs[0])).toBeLessThanOrEqual(1.5);
    expect(Math.abs(result.ys.at(-1)! - rendered.ys.at(-1)!)).toBeLessThanOrEqual(1.5);
  });

  it('survives an uneven illumination gradient', () => {
    const puzzle = samplePuzzle(sampleNamed('Tree')); // Tree, 15x15
    const { binary } = prepare(puzzle, {}, (g) => applyIlluminationGradient(g));
    const result = detectLattice(binary);
    expect(result.ok && [result.width, result.height]).toEqual([15, 15]);
  });

  it('survives speckle noise', () => {
    const puzzle = samplePuzzle(sampleNamed('Heart'));
    const { binary } = prepare(puzzle, {}, (g) => addNoise(g, 0.01, 7));
    const result = detectLattice(binary);
    expect(result.ok && [result.width, result.height]).toEqual([9, 9]);
  });

  it('handles a small cell size', () => {
    const puzzle = samplePuzzle(sampleNamed('Cat'));
    const { binary } = prepare(puzzle, { cell: 12 });
    const result = detectLattice(binary);
    expect(result.ok && [result.width, result.height]).toEqual([10, 10]);
  });

  it('handles clue bands that are ruled like a table', () => {
    const puzzle = samplePuzzle(sampleNamed('Heart'));
    const { binary } = prepare(puzzle, { ruledClueBands: true });
    const result = detectLattice(binary);
    expect(result.ok && [result.width, result.height]).toEqual([9, 9]);
  });

  it('reports failure on an image with no grid at all', () => {
    const blank: BinaryImage = { width: 60, height: 60, data: new Uint8Array(3600) };
    const result = detectLattice(blank);
    expect(result.ok).toBe(false);
  });
});

describe('latticeOfSize', () => {
  it('divides a known rectangle evenly', () => {
    const lattice = latticeOfSize({ x: 10, y: 20, width: 100, height: 50 }, 4, 5);
    expect(lattice.xs).toEqual([10, 35, 60, 85, 110]);
    expect(lattice.ys).toEqual([20, 30, 40, 50, 60, 70]);
  });
});
