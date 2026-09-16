// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { PhotoImport } from './PhotoImport';
import { perfectEngine, toImageData } from '../photo/__fixtures__/engine';
import { renderPuzzle } from '../photo/__fixtures__/render';
import { samplePuzzle, sampleNamed } from '../samples';
import type { OcrEngine } from '../photo/ocr';

const puzzle = samplePuzzle(sampleNamed('Heart')); // Heart, 9x9
const rendered = renderPuzzle(puzzle);

/**
 * jsdom has no canvas, so the 2D context is faked just well enough for the decode step
 * and the preview overlay. Everything downstream — preparation, deskew, lattice
 * detection, assignment — is the real implementation running on a real rendered puzzle.
 */
function stubCanvas(pixels: ImageData) {
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => pixels),
    createImageData: vi.fn((w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
      colorSpace: 'srgb',
    })),
    putImageData: vi.fn(),
    clearRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    lineWidth: 1,
    strokeStyle: '',
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: pixels.width, height: pixels.height, close: vi.fn() })),
  );
  return context;
}

const imageFile = () => new File(['x'], 'puzzle.png', { type: 'image/png' });

const choose = async (user: ReturnType<typeof userEvent.setup>) => {
  const input = document.querySelector('.file-button input') as HTMLInputElement;
  await user.upload(input, imageFile());
};

beforeEach(() => {
  localStorage.clear();
  stubCanvas(toImageData(rendered.gray));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  cleanup();
});

describe('PhotoImport', () => {
  const setup = (engine: OcrEngine, onApply = vi.fn(), onClose = vi.fn()) => {
    render(<PhotoImport engine={engine} onApply={onApply} onClose={onClose} />);
    return { onApply, onClose, user: userEvent.setup() };
  };

  it('reads a chosen image and reports a clean result', async () => {
    const { user } = setup(perfectEngine(rendered.blobs));
    await choose(user);

    await screen.findByText(/clean read/i);
    expect(screen.getByLabelText('Detected width')).toHaveValue(9);
    expect(screen.getByLabelText('Detected height')).toHaveValue(9);
  });

  it('hands the solver exactly the clues it read', async () => {
    const { onApply, user } = setup(perfectEngine(rendered.blobs));
    await choose(user);
    await screen.findByText(/clean read/i);

    await user.click(screen.getByRole('button', { name: 'Use these clues' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const [imported, uncertain] = onApply.mock.calls[0];
    expect(imported.rows).toEqual(puzzle.rows);
    expect(imported.cols).toEqual(puzzle.cols);
    expect(uncertain.size).toBe(0);
  });

  it('lists what it read, so a misread can be spotted before applying', async () => {
    const { user } = setup(perfectEngine(rendered.blobs));
    await choose(user);
    await screen.findByText(/clean read/i);

    await user.click(screen.getByText('What it read'));
    const lists = document.querySelectorAll('.clue-dump ol');
    expect(within(lists[0] as HTMLElement).getAllByRole('listitem')[0]).toHaveTextContent('2 2');
  });

  it('warns when the clue totals disagree', async () => {
    const corrupted = rendered.blobs.map((b) =>
      b.axis === 'row' && b.line === 0 && b.order === 0 ? { ...b, value: b.value + 5 } : b,
    );
    const { user } = setup(perfectEngine(corrupted));
    await choose(user);

    expect(await screen.findByText(/Row clues total .* but column clues total/)).toBeInTheDocument();
  });

  it('flags low-confidence lines and passes them on to be checked', async () => {
    const { onApply, user } = setup(perfectEngine(rendered.blobs, 30));
    await choose(user);
    await screen.findByText(/read poorly/);

    await user.click(screen.getByRole('button', { name: 'Use these clues' }));
    expect(onApply.mock.calls[0][1].size).toBeGreaterThan(0);
  });

  it('re-reads at a grid size corrected by hand', async () => {
    const { user } = setup(perfectEngine(rendered.blobs));
    await choose(user);
    await screen.findByText(/clean read/i);

    const width = screen.getByLabelText('Detected width');
    await user.clear(width);
    await user.type(width, '7');

    // The review stays on screen while the corrected size is re-read.
    expect(screen.getByLabelText('Detected width')).toHaveValue(7);
    await waitFor(() =>
      expect(screen.getByLabelText('Detected height')).toHaveValue(9),
    );
    await waitFor(
      () => {
        const items = document.querySelectorAll('.clue-dump ol')[0];
        expect(items).toBeTruthy();
      },
      { timeout: 2000 },
    );
  });

  it('explains a failure rather than importing nonsense', async () => {
    const blank = new Uint8ClampedArray(200 * 200 * 4).fill(255);
    stubCanvas({ width: 200, height: 200, data: blank, colorSpace: 'srgb' } as ImageData);

    const { user } = setup(perfectEngine([]));
    await choose(user);

    await waitFor(() =>
      expect(document.querySelector('.failure-reason')).toHaveTextContent(/nonogram|grid/i),
    );
    expect(screen.getByRole('button', { name: 'Try another image' })).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const { onClose, user } = setup(perfectEngine(rendered.blobs));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('the app after an import', () => {
  it('highlights the flagged clue lines until they are edited', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Load from photo' }));
    // The app wires in the real tesseract engine, so drive the modal directly instead.
    cleanup();

    const onApply = vi.fn();
    render(<PhotoImport engine={perfectEngine(rendered.blobs, 30)} onApply={onApply} onClose={vi.fn()} />);
    await choose(user);
    await screen.findByText(/read poorly/);
    await user.click(screen.getByRole('button', { name: 'Use these clues' }));

    const flagged: Set<string> = onApply.mock.calls[0][1];
    expect(flagged.has('row-0')).toBe(true);
  });
});
