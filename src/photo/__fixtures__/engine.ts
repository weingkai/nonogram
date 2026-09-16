import type { RecognisedSymbol } from '../assign';
import type { GrayImage, Rect } from '../image';
import type { OcrEngine } from '../ocr';
import type { ClueBlob } from './render';

/**
 * Stands in for tesseract: returns the true digits at their true positions for whichever
 * band it is handed. That isolates the geometry — if a puzzle does not round-trip, the
 * fault is in preparation, detection or assignment, not in OCR.
 */
export function perfectEngine(blobs: ClueBlob[], confidence = 95): OcrEngine {
  return {
    recognise: async (_img: GrayImage, region: Rect) => {
      const inRegion = (box: Rect) => {
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        return (
          cx >= region.x &&
          cx < region.x + region.width &&
          cy >= region.y &&
          cy < region.y + region.height
        );
      };
      // One symbol per digit, laid across the clue's box, matching what tesseract emits.
      return blobs
        .filter((b) => inRegion(b.box))
        .flatMap<RecognisedSymbol>((b) => {
          const digits = String(b.value);
          const each = b.box.width / digits.length;
          return [...digits].map((text, i) => ({
            text,
            confidence,
            box: { ...b.box, x: b.box.x + i * each, width: each },
          }));
        });
    },
  };
}

/** Turns a GrayImage into the RGBA ImageData a decoded file would produce. */
export function toImageData(gray: GrayImage): ImageData {
  const data = new Uint8ClampedArray(gray.width * gray.height * 4);
  for (let i = 0; i < gray.data.length; i++) {
    const p = i * 4;
    data[p] = gray.data[i];
    data[p + 1] = gray.data[i];
    data[p + 2] = gray.data[i];
    data[p + 3] = 255;
  }
  return { width: gray.width, height: gray.height, data, colorSpace: 'srgb' } as ImageData;
}
