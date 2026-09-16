import { describe, expect, it, vi } from 'vitest';
import { SAMPLES, samplePuzzle, sampleNamed } from '../samples';
import type { Puzzle } from '../solver/types';
import { rotateGray } from './deskew';
import type { GrayImage } from './image';
import { importPuzzle, prepare, reread } from './pipeline';
import { perfectEngine } from './__fixtures__/engine';
import { renderPuzzle } from './__fixtures__/render';

const expectPuzzle = (actual: Puzzle, expected: Puzzle) => {
  expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
  expect(actual.rows).toEqual(expected.rows);
  expect(actual.cols).toEqual(expected.cols);
};

describe('importPuzzle', () => {
  it.each(SAMPLES)('round-trips $name from a rendered image', async (sample) => {
    const puzzle = samplePuzzle(sample);
    const rendered = renderPuzzle(puzzle);

    const result = await importPuzzle(rendered.gray, perfectEngine(rendered.blobs));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expectPuzzle(result.reading.puzzle, puzzle);
    expect(result.problems).toEqual([]);
    expect(result.uncertain.size).toBe(0);
    expect(result.reading.strays).toBe(0);
  });

  it('round-trips a tilted image by straightening it first', async () => {
    const puzzle = samplePuzzle(sampleNamed('Tree'));
    const rendered = renderPuzzle(puzzle, { margin: 40 });
    const tilted = rotateGray(rendered.gray, (1.5 * Math.PI) / 180);

    // The blobs move with the image, so OCR is stubbed off the straightened geometry:
    // feed the tilted picture and let the pipeline recover the lattice itself.
    const result = await importPuzzle(tilted, perfectEngine(rendered.blobs));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Math.abs(result.prepared.skewDegrees)).toBeGreaterThan(1);
    expect([result.reading.puzzle.width, result.reading.puzzle.height]).toEqual([15, 15]);
  });

  it('reports what went wrong instead of importing nonsense', async () => {
    const blank: GrayImage = {
      width: 200,
      height: 200,
      data: new Uint8ClampedArray(40_000).fill(255),
    };
    const result = await importPuzzle(blank, perfectEngine([]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/nonogram|grid/i);
    expect(result.prepared).toBeDefined();
  });

  it('flags clues that were read with low confidence', async () => {
    const puzzle = samplePuzzle(sampleNamed('Heart'));
    const rendered = renderPuzzle(puzzle);
    const result = await importPuzzle(rendered.gray, perfectEngine(rendered.blobs, 35));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.uncertain.size).toBeGreaterThan(0);
  });

  it('surfaces a totals mismatch when a clue is misread', async () => {
    const puzzle = samplePuzzle(sampleNamed('Heart'));
    const rendered = renderPuzzle(puzzle);
    // Corrupt one row clue, as a 3-read-as-8 would.
    const corrupted = rendered.blobs.map((b) =>
      b.axis === 'row' && b.line === 0 && b.order === 0 ? { ...b, value: b.value + 5 } : b,
    );

    const result = await importPuzzle(rendered.gray, perfectEngine(corrupted));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.problems.some((p) => p.axis === 'puzzle')).toBe(true);
  });

  it('reports progress through the stages', async () => {
    const rendered = renderPuzzle(samplePuzzle(sampleNamed('Heart')));
    const onProgress = vi.fn();
    await importPuzzle(rendered.gray, perfectEngine(rendered.blobs), onProgress);
    const stages = onProgress.mock.calls.map(([p]) => p.stage);
    expect(stages).toContain('prepare');
    expect(stages).toContain('grid');
    expect(stages).toContain('read');
    expect(stages).toContain('check');
  });
});

describe('reread', () => {
  it('re-reads with a grid size corrected by hand', async () => {
    const puzzle = samplePuzzle(sampleNamed('Cat')); // 10x10
    const rendered = renderPuzzle(puzzle);
    const prepared = prepare(rendered.gray);

    const wrong = await reread(
      prepared,
      rendered.grid,
      5,
      5,
      perfectEngine(rendered.blobs),
    );
    expect([wrong.reading.puzzle.width, wrong.reading.puzzle.height]).toEqual([5, 5]);

    const right = await reread(
      prepared,
      rendered.grid,
      10,
      10,
      perfectEngine(rendered.blobs),
    );
    expectPuzzle(right.reading.puzzle, puzzle);
  });
});
