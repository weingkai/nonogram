import { createWorker, PSM, type Page, type Worker } from 'tesseract.js';
import type { RecognisedSymbol } from './assign';
import type { GrayImage, Rect } from './image';

/**
 * Where `npm run setup:ocr` puts the engine. Serving these ourselves keeps the import
 * working with no network, which was the point of choosing on-device OCR.
 */
const ASSET_BASE = `${import.meta.env.BASE_URL}tesseract/`;

/** Tesseract reads small type poorly; clue digits get scaled up to about this tall. */
const TARGET_CELL_PIXELS = 40;
const MAX_SCALE = 4;

/**
 * SINGLE_BLOCK is the only mode that reads an isolated digit; the sparse-text modes
 * discard lone characters as noise, and a clue line is mostly those.
 */
export const RECOGNITION_PARAMETERS = {
  tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
  tessedit_char_whitelist: '0123456789',
};

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      workerPath: `${ASSET_BASE}worker.min.js`,
      corePath: ASSET_BASE,
      langPath: ASSET_BASE,
    });
    workerPromise = workerPromise.catch((error: unknown) => {
      workerPromise = null;
      throw new Error(
        'Could not start the text recogniser. If this is a fresh checkout, run ' +
          '`npm run setup:ocr` to download the engine into public/tesseract/. ' +
          `(${error instanceof Error ? error.message : String(error)})`,
      );
    });
  }
  return workerPromise;
}

export function scaleFor(pitch: number): number {
  if (!(pitch > 0)) return 1;
  return Math.max(1, Math.min(MAX_SCALE, Math.round((TARGET_CELL_PIXELS / pitch) * 2) / 2));
}

/**
 * Crops a region out of the prepared grayscale image and blows it up onto a canvas,
 * which is what tesseract takes as input.
 */
export function cropToCanvas(img: GrayImage, rect: Rect, scale: number): HTMLCanvasElement {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(img.width, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(img.height, Math.ceil(rect.y + rect.height));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);

  const source = document.createElement('canvas');
  source.width = w;
  source.height = h;
  const sourceCtx = source.getContext('2d')!;
  const pixels = sourceCtx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const value = img.data[(y0 + y) * img.width + (x0 + x)];
      const p = (y * w + x) * 4;
      pixels.data[p] = value;
      pixels.data[p + 1] = value;
      pixels.data[p + 2] = value;
      pixels.data[p + 3] = 255;
    }
  }
  sourceCtx.putImageData(pixels, 0, 0);

  if (scale === 1) return source;

  const scaled = document.createElement('canvas');
  scaled.width = Math.round(w * scale);
  scaled.height = Math.round(h * scale);
  const ctx = scaled.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, scaled.width, scaled.height);
  return scaled;
}

/**
 * Flattens a tesseract page into individual digits, undoing the upscale and shifting the
 * boxes back into the prepared image's coordinate space.
 *
 * Digits rather than words, deliberately: tesseract groups whatever looks close enough
 * into a "word", so two clues sitting side by side come back as one number and a wide
 * two-digit clue can come back as two. Which clue a digit belongs to is a question the
 * lattice answers, not the layout analyser.
 */
export function symbolsFromPage(page: Page, band: Rect, scale: number): RecognisedSymbol[] {
  const symbols: RecognisedSymbol[] = [];
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        for (const word of line.words) {
          for (const symbol of word.symbols) {
            const text = symbol.text.trim();
            if (!text) continue;
            symbols.push({
              text,
              confidence: symbol.confidence,
              box: {
                x: band.x + symbol.bbox.x0 / scale,
                y: band.y + symbol.bbox.y0 / scale,
                width: (symbol.bbox.x1 - symbol.bbox.x0) / scale,
                height: (symbol.bbox.y1 - symbol.bbox.y0) / scale,
              },
            });
          }
        }
      }
    }
  }
  return symbols;
}

/**
 * Reads the digits in one region — in practice a single clue line's strip. Boxes come
 * back in the coordinate space of the prepared image, ready to match against the lattice.
 */
export async function recogniseRegion(
  img: GrayImage,
  region: Rect,
  scale: number,
): Promise<RecognisedSymbol[]> {
  if (region.width < 4 || region.height < 4) return [];

  const worker = await getWorker();
  const canvas = cropToCanvas(img, region, scale);
  // Set these before *every* recognition, not once at start-up: tesseract.js does not
  // hold the page-segmentation mode across calls, and silently reverting to the default
  // makes it return nothing at all for a lone digit.
  await worker.setParameters(RECOGNITION_PARAMETERS);
  const { data } = await worker.recognize(canvas, {}, { blocks: true });
  return symbolsFromPage(data, region, scale);
}

/** The shape `pipeline.ts` depends on, so tests can supply a stub instead of tesseract. */
export interface OcrEngine {
  recognise: (img: GrayImage, region: Rect, scale: number) => Promise<RecognisedSymbol[]>;
}

export const tesseractEngine: OcrEngine = { recognise: recogniseRegion };
