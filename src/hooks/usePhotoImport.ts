import { useCallback, useRef, useState } from 'react';
import { tesseractEngine, type OcrEngine } from '../photo/ocr';
import {
  decodeImageFile,
  importPuzzle,
  reread,
  type ImportProgress,
  type ImportSuccess,
  type Prepared,
} from '../photo/pipeline';

export type ImportState =
  | { status: 'idle' }
  | { status: 'working'; progress: ImportProgress }
  | { status: 'failed'; reason: string; prepared?: Prepared }
  /** `rereading` keeps the review on screen while a corrected size is re-read. */
  | { status: 'ready'; result: ImportSuccess; rereading?: boolean };

export interface PhotoImport {
  state: ImportState;
  /** Run the whole pipeline over a picked, dropped or pasted file. */
  read: (file: Blob) => Promise<void>;
  /** Re-read the clues at a grid size the user corrected. */
  resize: (width: number, height: number) => Promise<void>;
  reset: () => void;
}

/** Drives the photo pipeline and keeps the UI's view of its progress. */
export function usePhotoImport(engine: OcrEngine = tesseractEngine): PhotoImport {
  const [state, setState] = useState<ImportState>({ status: 'idle' });
  // Guards against a slow first import landing after the user has started another.
  const runId = useRef(0);

  const read = useCallback(
    async (file: Blob) => {
      const id = ++runId.current;
      setState({ status: 'working', progress: { stage: 'prepare', message: 'Opening the image…' } });
      try {
        const pixels = await decodeImageFile(file);
        const result = await importPuzzle(pixels, engine, (progress) => {
          if (runId.current === id) setState({ status: 'working', progress });
        });
        if (runId.current !== id) return;
        setState(
          result.ok
            ? { status: 'ready', result }
            : { status: 'failed', reason: result.reason, prepared: result.prepared },
        );
      } catch (error) {
        if (runId.current !== id) return;
        setState({
          status: 'failed',
          reason: error instanceof Error ? error.message : 'Could not read that image.',
        });
      }
    },
    [engine],
  );

  const resize = useCallback(
    async (width: number, height: number) => {
      const current = state;
      if (current.status !== 'ready') return;
      const id = ++runId.current;
      // Stay on the review screen: swapping it for a progress bar would yank the size
      // inputs out from under the user mid-edit.
      setState({ status: 'ready', result: current.result, rereading: true });
      try {
        const result = await reread(
          current.result.prepared,
          current.result.lattice.grid,
          width,
          height,
          engine,
        );
        if (runId.current === id) setState({ status: 'ready', result, rereading: false });
      } catch (error) {
        if (runId.current !== id) return;
        setState({
          status: 'failed',
          reason: error instanceof Error ? error.message : 'Could not re-read the clues.',
          prepared: current.result.prepared,
        });
      }
    },
    [state, engine],
  );

  const reset = useCallback(() => {
    runId.current++;
    setState({ status: 'idle' });
  }, []);

  return { state, read, resize, reset };
}
