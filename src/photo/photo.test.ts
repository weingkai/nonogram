import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectLattice } from './lattice';
import { prepare } from './pipeline';
import { decodePngToImageData } from './__fixtures__/png';

/**
 * A real phone photo of a puzzle game, kept because it broke the pipeline in three ways
 * at once that no synthetic fixture did: it is light-on-dark, its every-fifth rules are
 * doubled, and its clue numbers are packed tighter than its cells.
 *
 * This asserts the *geometry* only. What the digits say is down to tesseract, and this
 * game's stylised display face defeats it often enough that pinning exact clues here
 * would be testing the font, not the code.
 */
const image = () =>
  decodePngToImageData(readFileSync(resolve(process.cwd(), 'src/photo/__fixtures__/photo-009.png')));

describe('a real photo of a puzzle screen', () => {
  it('finds the 15×15 grid once the polarity is right', () => {
    const prepared = prepare(image(), true);
    const lattice = detectLattice(prepared.binary);

    expect(lattice.ok).toBe(true);
    if (!lattice.ok) return;
    expect([lattice.width, lattice.height]).toEqual([15, 15]);
    // The grid occupies the lower-right of the frame, below and right of the clue bands.
    expect(lattice.grid.x).toBeGreaterThan(250);
    expect(lattice.grid.y).toBeGreaterThan(500);
    expect(lattice.grid.width).toBeGreaterThan(700);
    // Cells are square to within the lens distortion.
    expect(lattice.grid.width / lattice.grid.height).toBeCloseTo(1, 1);
  });

  it('finds nothing at all with the polarity left alone', () => {
    // The automatic guess is fooled here — most of the frame is the pale wall behind the
    // screen — which is why importPuzzle tries both ways instead of trusting it.
    const prepared = prepare(image(), false);
    expect(prepared.inverted).toBe(false);
    const lattice = detectLattice(prepared.binary);
    expect(lattice.ok && [lattice.width, lattice.height]).not.toEqual([15, 15]);
  });
});
