import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWorker } from 'tesseract.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assignLines } from './assign';
import { grayFrom, type GrayImage, type Rect } from './image';
import { RECOGNITION_PARAMETERS, symbolsFromPage, type OcrEngine } from './ocr';
import { importPuzzle } from './pipeline';
import { clueLineStrips } from './regions';
import { cluesFromGrid } from '../solver/clues';
import { artToCells } from '../samples';
import { encodeGrayPng } from './__fixtures__/png';
import { renderPuzzle } from './__fixtures__/render';

/**
 * The only test that runs tesseract for real. Everything else stubs OCR to isolate the
 * geometry; this checks the engine settings, the per-line strips, the symbol box
 * arithmetic and the digit grouping all work together against the actual recogniser,
 * using the same vendored model the browser loads. Needs `npm run setup:ocr`.
 *
 * What it does *not* measure is tesseract's accuracy on real puzzle typography: the
 * fixtures are drawn with a 5×7 bitmap face, and its `5` is unreadable at any size, so
 * the puzzles here are chosen to avoid that digit. Real-world accuracy can only be
 * judged on real images.
 */
const ASSETS = resolve(process.cwd(), 'public/tesseract');
const ready = existsSync(resolve(ASSETS, 'eng.traineddata.gz'));

/** Settings where the fixture font reads reliably. */
const RENDER = { cell: 64, digitScale: 5, antialias: 2, lineWidth: 2, majorLineWidth: 3, margin: 24 };

const crop = (img: GrayImage, rect: Rect): GrayImage => {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const w = Math.max(1, Math.min(img.width - x0, Math.ceil(rect.width)));
  const h = Math.max(1, Math.min(img.height - y0, Math.ceil(rect.height)));
  const out = grayFrom(w, h, 255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out.data[y * w + x] = img.data[(y0 + y) * img.width + (x0 + x)];
    }
  }
  return out;
};

// A frame-within-a-frame, whose clues are all 1, 4 or 8 — no digit the fixture font
// cannot draw.
const PATTERN = [
  '########',
  '#......#',
  '#.####.#',
  '#.#..#.#',
  '#.#..#.#',
  '#.####.#',
  '#......#',
  '########',
];

describe.skipIf(!ready)('tesseract, for real', () => {
  let engine: OcrEngine;
  let terminate: (() => Promise<unknown>) | undefined;

  beforeAll(async () => {
    const worker = await createWorker('eng', 1, {
      corePath: ASSETS,
      langPath: ASSETS,
      gzip: true,
    });
    terminate = () => worker.terminate();

    engine = {
      recognise: async (img, region, scale) => {
        if (region.width < 4 || region.height < 4) return [];
        // Node takes encoded bytes rather than a canvas; the parameter reset and the
        // symbol mapping afterwards are the same as the browser path.
        const png = encodeGrayPng(crop(img, region));
        await worker.setParameters(RECOGNITION_PARAMETERS);
        const { data } = await worker.recognize(png, {}, { blocks: true });
        return symbolsFromPage(data, region, scale);
      },
    };
  }, 180_000);

  afterAll(async () => {
    await terminate?.();
  });

  it('reads the digits off a rendered puzzle and rebuilds it', async () => {
    const puzzle = cluesFromGrid(artToCells(PATTERN));
    const rendered = renderPuzzle(puzzle, RENDER);

    const result = await importPuzzle(rendered.gray, engine);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect([result.reading.puzzle.width, result.reading.puzzle.height]).toEqual([8, 8]);
    expect(result.reading.strays).toBe(0);

    const read = [...result.reading.puzzle.rows, ...result.reading.puzzle.cols];
    const truth = [...puzzle.rows, ...puzzle.cols];

    // Structure has to be exact: every line must yield the right *number* of clues, which
    // is what proves the strips, the cell grouping and the ordering are all right.
    expect(read.map((clues) => clues.length)).toEqual(truth.map((clues) => clues.length));

    // Values are allowed the odd slip. This is a 5×7 bitmap face, not real puzzle
    // typography, and a stray misread is exactly what the review step exists for.
    const exact = read.filter((clues, i) => clues.join() === truth[i].join()).length;
    expect(exact / truth.length).toBeGreaterThanOrEqual(0.9);
  }, 180_000);

  it('reads every clue line, including ones holding a single digit', async () => {
    // The regression guard for the bug this test found: tesseract.js does not keep the
    // page-segmentation mode between calls, and on the default mode a lone digit reads
    // as nothing at all — so most of the puzzle silently came back blank.
    const puzzle = cluesFromGrid(artToCells(PATTERN));
    const rendered = renderPuzzle(puzzle, RENDER);

    const result = await importPuzzle(rendered.gray, engine);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const emptyRows = result.reading.puzzle.rows.filter((clues) => clues.length === 0);
    const emptyCols = result.reading.puzzle.cols.filter((clues) => clues.length === 0);
    expect([emptyRows.length, emptyCols.length]).toEqual([0, 0]);
  }, 180_000);

  it('groups digits into clues by cell, not by how tesseract words them', async () => {
    // "10" and "1" sit in neighbouring cells; read as text they come back as one number.
    const puzzle = {
      width: 12,
      height: 3,
      rows: [[12], [10, 1], [3]],
      cols: Array.from({ length: 12 }, () => [1]),
    };
    const rendered = renderPuzzle(puzzle, RENDER);
    const lattice = {
      xs: rendered.xs,
      ys: rendered.ys,
      width: 12,
      height: 3,
      grid: rendered.grid,
    };

    const strips = clueLineStrips(lattice);
    const rowSymbols = [];
    for (const strip of strips.rows) {
      rowSymbols.push(await engine.recognise(rendered.gray, strip, 1));
    }

    const reading = assignLines(lattice, rowSymbols, strips.cols.map(() => []));
    expect(reading.puzzle.rows).toEqual([[12], [10, 1], [3]]);
  }, 180_000);
});
