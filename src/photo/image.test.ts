import { describe, expect, it } from 'vitest';
import {
  binarize,
  boxBlur,
  cropBinary,
  downscale,
  flattenIllumination,
  grayFrom,
  inkBounds,
  otsuThreshold,
  toGray,
  type GrayImage,
} from './image';
import { applyIlluminationGradient, renderPuzzle } from './__fixtures__/render';
import { SAMPLES, samplePuzzle } from '../samples';

const imageData = (width: number, height: number, pixels: number[][]): ImageData => {
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach(([r, g, b, a], i) => {
    data.set([r, g, b, a ?? 255], i * 4);
  });
  return { width, height, data, colorSpace: 'srgb' } as ImageData;
};

describe('toGray', () => {
  it('uses luma weights', () => {
    const gray = toGray(imageData(3, 1, [[255, 255, 255, 255], [0, 0, 0, 255], [255, 0, 0, 255]]));
    expect(gray.data[0]).toBe(255);
    expect(gray.data[1]).toBe(0);
    expect(gray.data[2]).toBe(Math.round(0.299 * 255));
  });

  it('composites transparency over white so PNG cut-outs do not read as ink', () => {
    const gray = toGray(imageData(1, 1, [[0, 0, 0, 0]]));
    expect(gray.data[0]).toBe(255);
  });
});

describe('boxBlur', () => {
  it('spreads a single dark pixel over its window and preserves the total', () => {
    const img = grayFrom(9, 9, 255);
    img.data[4 * 9 + 4] = 0;
    const blurred = boxBlur(img, 1);
    expect(blurred.data[4 * 9 + 4]).toBeGreaterThan(0);
    expect(blurred.data[4 * 9 + 4]).toBeLessThan(255);
    expect(blurred.data[0]).toBe(255); // far corner untouched
  });

  it('leaves a flat image flat', () => {
    const blurred = boxBlur(grayFrom(20, 20, 128), 3);
    expect([...blurred.data].every((v) => v === 128)).toBe(true);
  });
});

describe('otsuThreshold', () => {
  it('splits a bimodal histogram so binarising picks out exactly the dark mode', () => {
    const img = grayFrom(100, 1, 240);
    for (let i = 0; i < 30; i++) img.data[i] = 30;

    const threshold = otsuThreshold(img);
    expect(threshold).toBeGreaterThanOrEqual(30);
    expect(threshold).toBeLessThan(240);

    const mask = binarize(img, threshold);
    expect(mask.data.reduce((a, b) => a + b, 0)).toBe(30);
  });
});

describe('flattenIllumination', () => {
  it('recovers the same ink mask from an unevenly lit copy', () => {
    const rendered = renderPuzzle(samplePuzzle(SAMPLES[0]));
    const shaded = applyIlluminationGradient(rendered.gray, 0.55);

    const maskOf = (img: GrayImage) => {
      const flat = flattenIllumination(img);
      return binarize(flat, otsuThreshold(flat));
    };
    const clean = maskOf(rendered.gray);
    const lit = maskOf(shaded);

    let differing = 0;
    for (let i = 0; i < clean.data.length; i++) if (clean.data[i] !== lit.data[i]) differing++;
    expect(differing / clean.data.length).toBeLessThan(0.01);
  });

  it('survives a shadow deep enough to defeat a plain global threshold', () => {
    // A mild gradient needs no help — one global threshold still separates ink from
    // paper. Flattening earns its place only when the darkest paper is darker than the
    // lightest ink, which is exactly what a hand shadow across a page does.
    const rendered = renderPuzzle(samplePuzzle(SAMPLES[0]));
    const shaded = applyIlluminationGradient(rendered.gray, 0.95);

    const clean = binarize(
      flattenIllumination(rendered.gray),
      otsuThreshold(flattenIllumination(rendered.gray)),
    );
    const disagreement = (mask: { data: Uint8Array }) => {
      let differing = 0;
      for (let i = 0; i < clean.data.length; i++) {
        if (clean.data[i] !== mask.data[i]) differing++;
      }
      return differing / clean.data.length;
    };

    const naive = binarize(shaded, otsuThreshold(shaded));
    const flattened = binarize(
      flattenIllumination(shaded),
      otsuThreshold(flattenIllumination(shaded)),
    );

    // Same image, same ink — only the lighting differs.
    expect(disagreement(flattened)).toBeLessThan(0.01);
    expect(disagreement(naive)).toBeGreaterThan(0.05);
  });
});

describe('downscale', () => {
  it('returns the original when it already fits', () => {
    const img = grayFrom(50, 30);
    expect(downscale(img, 100)).toBe(img);
  });

  it('shrinks the long side to the limit and keeps the aspect ratio', () => {
    const small = downscale(grayFrom(800, 400), 200);
    expect(small.width).toBe(200);
    expect(small.height).toBe(100);
  });

  it('averages rather than dropping pixels', () => {
    const img = grayFrom(4, 1, 0);
    img.data[0] = 255;
    img.data[1] = 255;
    const small = downscale(img, 2);
    expect(small.width).toBe(2);
    expect(small.data[0]).toBe(255);
    expect(small.data[1]).toBe(0);
  });
});

describe('inkBounds and cropBinary', () => {
  it('finds the ink and crops to it', () => {
    const mask = { width: 10, height: 10, data: new Uint8Array(100) };
    mask.data[3 * 10 + 2] = 1;
    mask.data[6 * 10 + 7] = 1;
    const bounds = inkBounds(mask)!;
    expect(bounds).toEqual({ x: 2, y: 3, width: 6, height: 4 });

    const cropped = cropBinary(mask, bounds);
    expect(cropped.width).toBe(6);
    expect(cropped.data[0]).toBe(1);
    expect(cropped.data[cropped.data.length - 1]).toBe(1);
  });

  it('returns null for a blank mask', () => {
    expect(inkBounds({ width: 4, height: 4, data: new Uint8Array(16) })).toBeNull();
  });
});
