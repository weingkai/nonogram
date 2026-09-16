import { describe, expect, it } from 'vitest';
import { samplePuzzle, sampleNamed } from '../samples';
import { binarize, flattenIllumination, otsuThreshold } from './image';
import { deskew, estimateSkew, rotateGray } from './deskew';
import { detectLattice } from './lattice';
import { renderPuzzle } from './__fixtures__/render';

const binaryOf = (gray: Parameters<typeof flattenIllumination>[0]) => {
  const flat = flattenIllumination(gray);
  return binarize(flat, otsuThreshold(flat));
};

describe('estimateSkew', () => {
  it.each([-2, -1, 1.5, 3])('recovers a %s° rotation', (degrees) => {
    const rendered = renderPuzzle(samplePuzzle(sampleNamed('Tree')), { margin: 40 });
    const rotated = rotateGray(rendered.gray, (degrees * Math.PI) / 180);
    const estimate = estimateSkew(binaryOf(rotated));
    expect(estimate.degrees).toBeCloseTo(degrees, 0);
  });

  it('leaves a level image alone', () => {
    const rendered = renderPuzzle(samplePuzzle(sampleNamed('Heart')));
    expect(Math.abs(estimateSkew(binaryOf(rendered.gray)).degrees)).toBeLessThanOrEqual(0.25);
  });

  it('returns zero for an image with almost no ink', () => {
    expect(estimateSkew({ width: 40, height: 40, data: new Uint8Array(1600) }).degrees).toBe(0);
  });
});

describe('deskew', () => {
  it('straightens a tilted scan enough for the grid to be found', () => {
    const puzzle = samplePuzzle(sampleNamed('Tree'));
    const rendered = renderPuzzle(puzzle, { margin: 40 });
    const tilted = rotateGray(rendered.gray, (2 * Math.PI) / 180);

    // Tilted, the ruling no longer lines up into columns and detection goes badly
    // wrong — note it reports a confident answer, not a failure, which is why the
    // import always shows its work before applying anything.
    const naive = detectLattice(binaryOf(tilted));
    expect(naive.ok && [naive.width, naive.height]).not.toEqual([15, 15]);

    const straightened = deskew(tilted, binaryOf(tilted));
    const result = detectLattice(binaryOf(straightened.gray));
    expect(result.ok && [result.width, result.height]).toEqual([15, 15]);
  });

  it('does not resample an already level image', () => {
    const rendered = renderPuzzle(samplePuzzle(sampleNamed('Heart')));
    const result = deskew(rendered.gray, binaryOf(rendered.gray));
    expect(result.degrees).toBe(0);
    expect(result.gray).toBe(rendered.gray);
  });
});
