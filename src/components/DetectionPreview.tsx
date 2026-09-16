import { useEffect, useRef } from 'react';
import type { GrayImage } from '../photo/image';
import type { Lattice } from '../photo/lattice';
import { clueBands } from '../photo/regions';

interface Props {
  image: GrayImage;
  lattice?: Lattice;
  maxWidth?: number;
}

/**
 * Shows the image as the pipeline saw it, with the detected grid drawn on top. When a
 * read goes wrong this is the fastest way to see why — a lattice that has slipped onto
 * the clue bands, or a grid that was never found, is obvious at a glance.
 */
export function DetectionPreview({ image, lattice, maxWidth = 420 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scale = Math.min(1, maxWidth / image.width);
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const source = document.createElement('canvas');
    source.width = image.width;
    source.height = image.height;
    const sourceCtx = source.getContext('2d');
    if (!sourceCtx) return;
    const pixels = sourceCtx.createImageData(image.width, image.height);
    for (let i = 0; i < image.data.length; i++) {
      const p = i * 4;
      pixels.data[p] = image.data[i];
      pixels.data[p + 1] = image.data[i];
      pixels.data[p + 2] = image.data[i];
      pixels.data[p + 3] = 255;
    }
    sourceCtx.putImageData(pixels, 0, 0);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    if (!lattice) return;

    const bands = clueBands(lattice);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(99, 210, 151, 0.9)';
    ctx.setLineDash([4, 3]);
    for (const band of [bands.row, bands.col]) {
      ctx.strokeRect(band.x * scale, band.y * scale, band.width * scale, band.height * scale);
    }

    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(110, 168, 254, 0.85)';
    ctx.beginPath();
    for (const x of lattice.xs) {
      ctx.moveTo(x * scale, lattice.ys[0] * scale);
      ctx.lineTo(x * scale, lattice.ys[lattice.ys.length - 1] * scale);
    }
    for (const y of lattice.ys) {
      ctx.moveTo(lattice.xs[0] * scale, y * scale);
      ctx.lineTo(lattice.xs[lattice.xs.length - 1] * scale, y * scale);
    }
    ctx.stroke();
  }, [image, lattice, maxWidth]);

  return <canvas ref={canvasRef} className="detection-preview" aria-label="Detected grid" />;
}
