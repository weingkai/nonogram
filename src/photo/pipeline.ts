import { validatePuzzle, type PuzzleProblem } from '../solver/clues';
import { assignLines, uncertainLines, type Reading } from './assign';
import { deskew } from './deskew';
import {
  binarize,
  downscale,
  flattenIllumination,
  otsuThreshold,
  toGray,
  type BinaryImage,
  type GrayImage,
} from './image';
import { detectLattice, latticeOfSize, type Lattice } from './lattice';
import { scaleFor, type OcrEngine } from './ocr';
import { clueLineStrips } from './regions';

/** Anything larger is slow to process and no more accurate. */
export const WORKING_SIZE = 1600;

export type Stage = 'prepare' | 'straighten' | 'grid' | 'read' | 'check';

export interface ImportProgress {
  stage: Stage;
  message: string;
  /** 0–1 within the current stage, when known. */
  fraction?: number;
}

export interface Prepared {
  gray: GrayImage;
  binary: BinaryImage;
  skewDegrees: number;
}

export interface ImportSuccess {
  ok: true;
  prepared: Prepared;
  lattice: Lattice;
  reading: Reading;
  /** Structural problems with the puzzle as read — chiefly mismatched clue totals. */
  problems: PuzzleProblem[];
  /** Keys like `"row-3"` worth checking before solving. */
  uncertain: Set<string>;
}

export interface ImportFailure {
  ok: false;
  reason: string;
  /** Present when preparation succeeded, so the UI can still show what it saw. */
  prepared?: Prepared;
}

export type ImportResult = ImportSuccess | ImportFailure;

/** Grayscale, flatten the lighting, threshold, and straighten. Pure — no DOM, no OCR. */
export function prepare(image: ImageData | GrayImage): Prepared {
  // ImageData carries four bytes per pixel; a GrayImage carries one.
  const isRgba = image.data.length === image.width * image.height * 4;
  const source = isRgba ? toGray(image as ImageData) : (image as GrayImage);
  const scaled = downscale(source, WORKING_SIZE);

  const maskOf = (gray: GrayImage) => {
    const flat = flattenIllumination(gray);
    return binarize(flat, otsuThreshold(flat));
  };

  const firstPass = maskOf(scaled);
  const straightened = deskew(scaled, firstPass);
  const gray = straightened.gray;

  return {
    gray,
    binary: straightened.degrees === 0 ? firstPass : maskOf(gray),
    skewDegrees: straightened.degrees,
  };
}

/**
 * Reads the clue bands either side of a known lattice and turns them into a puzzle.
 * Split out from {@link importPuzzle} so a hand-corrected grid size can be re-read
 * without redoing the image preparation.
 */
export async function readWithLattice(
  prepared: Prepared,
  lattice: Lattice,
  engine: OcrEngine,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportSuccess> {
  const strips = clueLineStrips(lattice);
  const pitch = (lattice.grid.width / lattice.width + lattice.grid.height / lattice.height) / 2;
  const scale = scaleFor(pitch);

  // One pass per clue line rather than one per band: tesseract only reliably reads an
  // isolated digit when the image it is given is just that line.
  const total = strips.rows.length + strips.cols.length;
  let done = 0;
  const readStrip = async (strip: (typeof strips.rows)[number]) => {
    const symbols = await engine.recognise(prepared.gray, strip, scale);
    done++;
    onProgress?.({
      stage: 'read',
      message: `Reading the clues… (${done} of ${total})`,
      fraction: done / total,
    });
    return symbols;
  };

  onProgress?.({ stage: 'read', message: 'Reading the clues…', fraction: 0 });
  const rowSymbols = [];
  for (const strip of strips.rows) rowSymbols.push(await readStrip(strip));
  const colSymbols = [];
  for (const strip of strips.cols) colSymbols.push(await readStrip(strip));

  onProgress?.({ stage: 'check', message: 'Checking the clues add up…' });
  const reading = assignLines(lattice, rowSymbols, colSymbols);

  return {
    ok: true,
    prepared,
    lattice,
    reading,
    problems: validatePuzzle(reading.puzzle),
    uncertain: uncertainLines(reading),
  };
}

/** Photo in, puzzle out. */
export async function importPuzzle(
  image: ImageData | GrayImage,
  engine: OcrEngine,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  onProgress?.({ stage: 'prepare', message: 'Preparing the image…' });
  const prepared = prepare(image);

  if (prepared.skewDegrees !== 0) {
    onProgress?.({
      stage: 'straighten',
      message: `Straightened by ${prepared.skewDegrees.toFixed(1)}°.`,
    });
  }

  onProgress?.({ stage: 'grid', message: 'Looking for the grid…' });
  const lattice = detectLattice(prepared.binary);
  if (!lattice.ok) return { ok: false, reason: lattice.reason, prepared };

  return readWithLattice(prepared, lattice, engine, onProgress);
}

/** Re-reads the clues with a grid size the user has corrected by hand. */
export async function reread(
  prepared: Prepared,
  grid: Lattice['grid'],
  width: number,
  height: number,
  engine: OcrEngine,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportSuccess> {
  return readWithLattice(prepared, latticeOfSize(grid, width, height), engine, onProgress);
}

/** Decodes a picked or dropped file into pixels. Browser only. */
export async function decodeImageFile(file: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
