import { describe, expect, it } from 'vitest';
import { SAMPLES, samplePuzzle, sampleNamed } from '../samples';
import { cluePitch } from './assign';
import { binarize, flattenIllumination, invert, isLightOnDark, otsuThreshold } from './image';
import { detectLattice, mergeClosePeaks } from './lattice';
import { importPuzzle, prepare } from './pipeline';
import { perfectEngine } from './__fixtures__/engine';
import { renderPuzzle } from './__fixtures__/render';

/**
 * Regressions found by running a phone photo of a puzzle game through the pipeline.
 * Every one of these passed silently before, because the synthetic fixtures happened to
 * avoid all three: dark ink on light paper, one clue per grid cell, and thin single
 * rules.
 */

const maskOf = (gray: Parameters<typeof flattenIllumination>[0]) => {
  const flat = flattenIllumination(gray);
  return binarize(flat, otsuThreshold(flat));
};

describe('light-on-dark images', () => {
  it('is what a dark-mode screenshot looks like', () => {
    const rendered = renderPuzzle(samplePuzzle(sampleNamed('Heart')));
    expect(isLightOnDark(rendered.gray)).toBe(false);
    expect(isLightOnDark(invert(rendered.gray))).toBe(true);
  });

  it('finds no grid at all if the polarity is left alone', () => {
    const rendered = renderPuzzle(samplePuzzle(sampleNamed('Tree')));
    const flipped = invert(rendered.gray);
    // Straight through the geometry with the wrong polarity, the "ink" is the paper.
    const naive = detectLattice(maskOf(flipped));
    expect(naive.ok && [naive.width, naive.height]).not.toEqual([15, 15]);
  });

  it.each(SAMPLES)('reads $name inverted', async (sample) => {
    const puzzle = samplePuzzle(sample);
    const rendered = renderPuzzle(puzzle);
    const flipped = invert(rendered.gray);

    const result = await importPuzzle(flipped, perfectEngine(rendered.blobs));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prepared.inverted).toBe(true);
    expect(result.reading.puzzle.rows).toEqual(puzzle.rows);
    expect(result.reading.puzzle.cols).toEqual(puzzle.cols);
  });

  it('still reads a normal image, so trying both ways costs nothing', async () => {
    const puzzle = samplePuzzle(sampleNamed('Cat'));
    const rendered = renderPuzzle(puzzle);
    const result = await importPuzzle(rendered.gray, perfectEngine(rendered.blobs));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prepared.inverted).toBe(false);
    expect(result.reading.puzzle.rows).toEqual(puzzle.rows);
  });

  it('handles a dark puzzle photographed against a bright surround', () => {
    // The automatic guess gets this wrong — most of the frame is the bright wall — which
    // is why detection is attempted both ways rather than trusting it.
    const rendered = renderPuzzle(samplePuzzle(sampleNamed('Heart')));
    const dark = invert(rendered.gray);
    const framed = {
      width: dark.width + 400,
      height: dark.height + 400,
      data: new Uint8ClampedArray((dark.width + 400) * (dark.height + 400)).fill(245),
    };
    for (let y = 0; y < dark.height; y++) {
      for (let x = 0; x < dark.width; x++) {
        framed.data[(y + 200) * framed.width + x + 200] = dark.data[y * dark.width + x];
      }
    }

    expect(isLightOnDark(framed)).toBe(false); // the guess is fooled
    const forced = prepare(framed, true);
    const lattice = detectLattice(forced.binary);
    expect(lattice.ok && [lattice.width, lattice.height]).toEqual([9, 9]);
  });
});

describe('doubled rules', () => {
  it('merges peaks that sit far closer than the pitch', () => {
    // A heavier every-fifth rule drawn beside the ordinary one resolves as two peaks a
    // few pixels apart, and that tiny gap is not a whole number of cells.
    expect(mergeClosePeaks([100, 152, 154, 206, 258, 310])).toEqual([100, 153, 206, 258, 310]);
  });

  it('leaves genuinely separate lines alone', () => {
    expect(mergeClosePeaks([100, 150, 200, 250])).toEqual([100, 150, 200, 250]);
  });

  it('recovers the grid when every fifth rule is doubled', () => {
    const puzzle = samplePuzzle(sampleNamed('Tree')); // 15x15, rules at 0, 5, 10, 15
    const rendered = renderPuzzle(puzzle, { majorLineWidth: 2 });
    const gray = rendered.gray;
    // Draw a second rule 3px beside each major one, as the photo's orange separators did.
    for (let i = 0; i <= puzzle.width; i += 5) {
      const x = Math.round(rendered.xs[i]) + 3;
      for (let y = rendered.grid.y; y < rendered.grid.y + rendered.grid.height; y++) {
        gray.data[y * gray.width + x] = 20;
      }
    }

    const result = detectLattice(maskOf(gray));
    expect(result.ok && [result.width, result.height]).toEqual([15, 15]);
  });
});

describe('clue spacing that differs from the grid', () => {
  it('measures the clue pitch from the digits rather than assuming the cell size', () => {
    const digits = (positions: number[]) =>
      positions.map((x) => ({ text: '1', confidence: 90, box: { x, y: 0, width: 10, height: 14 } }));
    // Clues every 39px while the grid runs at 53px.
    const lines = [digits([0, 39, 78]), digits([0, 39]), digits([0, 39, 78, 117])];
    expect(cluePitch(lines, 'x', 53)).toBeCloseTo(39, 0);
  });

  it('falls back to the grid pitch when the estimate is implausible', () => {
    const lines = [[{ text: '1', confidence: 90, box: { x: 0, y: 0, width: 10, height: 14 } }]];
    expect(cluePitch(lines, 'x', 53)).toBe(53);
  });

  it('round-trips a puzzle whose clues are packed tighter than its cells', async () => {
    const puzzle = samplePuzzle(sampleNamed('Tree'));
    // 0.73x, the ratio measured off the real photo.
    const rendered = renderPuzzle(puzzle, { cell: 30, clueSpacing: 22 });

    const result = await importPuzzle(rendered.gray, perfectEngine(rendered.blobs));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reading.puzzle.rows).toEqual(puzzle.rows);
    expect(result.reading.puzzle.cols).toEqual(puzzle.cols);
  });
});
