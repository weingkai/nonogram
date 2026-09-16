import type { GrayImage } from '../image';

/**
 * A 5×7 bitmap face for the digits, so fixtures can contain text that OCR can actually
 * read. Node has no font rasteriser, and this is the whole alphabet a nonogram needs.
 */
const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['01110', '10001', '00001', '00110', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};

export const GLYPH_WIDTH = 5;
export const GLYPH_HEIGHT = 7;
/** Blank columns between digits of the same number. */
export const GLYPH_GAP = 1;

export function numberWidth(text: string, scale: number): number {
  return (text.length * GLYPH_WIDTH + (text.length - 1) * GLYPH_GAP) * scale;
}

export const numberHeight = (scale: number) => GLYPH_HEIGHT * scale;

/** Draws `text` with its top-left at (x, y), each font pixel an `scale`×`scale` block. */
export function drawNumber(
  img: GrayImage,
  text: string,
  x: number,
  y: number,
  scale: number,
  ink: number,
): void {
  let cursor = Math.round(x);
  const top = Math.round(y);

  for (const char of text) {
    const glyph = GLYPHS[char];
    if (!glyph) continue;
    for (let gy = 0; gy < GLYPH_HEIGHT; gy++) {
      for (let gx = 0; gx < GLYPH_WIDTH; gx++) {
        if (glyph[gy][gx] !== '1') continue;
        for (let dy = 0; dy < scale; dy++) {
          const py = top + gy * scale + dy;
          if (py < 0 || py >= img.height) continue;
          const row = py * img.width;
          for (let dx = 0; dx < scale; dx++) {
            const px = cursor + gx * scale + dx;
            if (px < 0 || px >= img.width) continue;
            img.data[row + px] = ink;
          }
        }
      }
    }
    cursor += (GLYPH_WIDTH + GLYPH_GAP) * scale;
  }
}
