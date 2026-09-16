import { useEffect, useRef, useState } from 'react';
import { usePhotoImport } from '../hooks/usePhotoImport';
import type { OcrEngine } from '../photo/ocr';
import { formatClues } from '../solver/clues';
import type { Puzzle } from '../solver/types';
import { DetectionPreview } from './DetectionPreview';

interface Props {
  onApply: (puzzle: Puzzle, uncertain: Set<string>) => void;
  onClose: () => void;
  /** Injected in tests so the pipeline can be stubbed. */
  engine?: OcrEngine;
}

export function PhotoImport({ onApply, onClose, engine }: Props) {
  const { state, read, resize, reset } = usePhotoImport(engine);
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState<{ width: number; height: number; of: string } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A screenshot on the clipboard is the quickest path in, so accept a paste anywhere.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.items ?? [])]
        .find((item) => item.type.startsWith('image/'))
        ?.getAsFile();
      if (file) void read(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [read]);

  const ready = state.status === 'ready' ? state.result : null;
  const rereading = state.status === 'ready' && state.rereading === true;
  const detected = ready?.lattice;

  // The size boxes show a local draft so typing stays responsive. Tagging the draft with
  // the size it was edited from means it is dropped automatically once a re-read lands —
  // no effect needed to keep the two in step.
  const detectedKey = detected ? `${detected.width}x${detected.height}` : '';
  const size = detected
    ? draft?.of === detectedKey
      ? draft
      : { width: detected.width, height: detected.height, of: detectedKey }
    : null;
  const editSize = (next: { width: number; height: number }) =>
    setDraft({ ...next, of: detectedKey });

  // Re-read once the user pauses, rather than on every keystroke. Depends on the two
  // numbers rather than the `size` object, which is rebuilt every render.
  const wantedWidth = size?.width ?? 0;
  const wantedHeight = size?.height ?? 0;
  useEffect(() => {
    if (!detected) return;
    if (wantedWidth === detected.width && wantedHeight === detected.height) return;
    if (wantedWidth < 1 || wantedHeight < 1) return;
    const timer = window.setTimeout(() => void resize(wantedWidth, wantedHeight), 350);
    return () => window.clearTimeout(timer);
  }, [wantedWidth, wantedHeight, detected, resize]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Load a puzzle from a photo"
        ref={dialogRef}
      >
        <header className="modal-head">
          <h2>Load from a photo</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>

        {state.status === 'idle' && (
          <div
            className={`dropzone ${dragging ? 'over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) void read(file);
            }}
          >
            <p className="dropzone-lead">Take a photo, or choose a screenshot of a puzzle.</p>
            <label className="file-button">
              Choose image
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void read(file);
                }}
              />
            </label>
            <p className="hint">You can also drag an image here, or paste one.</p>
            <p className="hint">
              Works best square-on to the page, with the whole grid and both sets of clues in
              frame.
            </p>
          </div>
        )}

        {state.status === 'working' && (
          <div className="working">
            <p>{state.progress.message}</p>
            <progress
              max={1}
              value={state.progress.fraction}
              aria-label={state.progress.message}
            />
          </div>
        )}

        {state.status === 'failed' && (
          <div className="import-failed">
            <p className="failure-reason">{state.reason}</p>
            {state.prepared && (
              <DetectionPreview image={state.prepared.gray} />
            )}
            <p className="hint">
              Crop tighter around the puzzle, or make sure the grid lines are visible and the
              image is square-on.
            </p>
            <div className="modal-actions">
              <button onClick={reset}>Try another image</button>
              <button onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}

        {ready && (
          <div className="import-review">
            <DetectionPreview image={ready.prepared.gray} lattice={ready.lattice} />

            <div className="review-details">
              <label className="size-override">
                Grid size
                <span>
                  <input
                    type="number"
                    min={1}
                    max={80}
                    value={size?.width ?? ready.lattice.width}
                    aria-label="Detected width"
                    onChange={(e) =>
                      editSize({
                        width: Number(e.target.value) || 0,
                        height: size?.height ?? ready.lattice.height,
                      })
                    }
                  />
                  ×
                  <input
                    type="number"
                    min={1}
                    max={80}
                    value={size?.height ?? ready.lattice.height}
                    aria-label="Detected height"
                    onChange={(e) =>
                      editSize({
                        width: size?.width ?? ready.lattice.width,
                        height: Number(e.target.value) || 0,
                      })
                    }
                  />
                </span>
                {rereading && <span className="hint">re-reading…</span>}
              </label>

              {ready.prepared.skewDegrees !== 0 && (
                <p className="hint">
                  Straightened by {ready.prepared.skewDegrees.toFixed(1)}°.
                </p>
              )}

              <ul className="import-warnings">
                {ready.problems.map((problem, i) => (
                  <li key={`p-${i}`} className="warn">
                    {problem.message}
                  </li>
                ))}
                {ready.reading.strays > 0 && (
                  <li className="warn">
                    {ready.reading.strays} number
                    {ready.reading.strays > 1 ? 's' : ''} fell outside the clue areas.
                  </li>
                )}
                {ready.uncertain.size > 0 && (
                  <li className="warn">
                    {ready.uncertain.size} line{ready.uncertain.size > 1 ? 's' : ''} read
                    poorly — they will be highlighted for you to check.
                  </li>
                )}
                {ready.problems.length === 0 &&
                  ready.uncertain.size === 0 &&
                  ready.reading.strays === 0 && (
                    <li className="good">The clues are consistent — this looks like a clean read.</li>
                  )}
              </ul>

              <details className="clue-dump">
                <summary>What it read</summary>
                <div>
                  <strong>Rows</strong>
                  <ol>
                    {ready.reading.rows.map((row, i) => (
                      <li key={i} className={row.note ? 'uncertain' : ''}>
                        {formatClues(row.clues) || '—'}
                        {row.note && <em> ({row.note})</em>}
                      </li>
                    ))}
                  </ol>
                  <strong>Columns</strong>
                  <ol>
                    {ready.reading.cols.map((col, i) => (
                      <li key={i} className={col.note ? 'uncertain' : ''}>
                        {formatClues(col.clues) || '—'}
                        {col.note && <em> ({col.note})</em>}
                      </li>
                    ))}
                  </ol>
                </div>
              </details>
            </div>

            <div className="modal-actions">
              <button
                className="primary"
                onClick={() => onApply(ready.reading.puzzle, ready.uncertain)}
              >
                Use these clues
              </button>
              <button onClick={reset}>Try another image</button>
              <button onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
