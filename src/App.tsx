import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controls } from './components/Controls';
import { LogPanel } from './components/LogPanel';
import { PuzzleGrid } from './components/PuzzleGrid';
import { usePlayback } from './hooks/usePlayback';
import { SAMPLES, samplePuzzle } from './samples';
import { validatePuzzle } from './solver/clues';
import { applySteps, solveAll } from './solver/solve';
import { emptyGrid, idx, type Axis, type Puzzle, type SolveResult } from './solver/types';

const STORAGE_KEY = 'nonogram:puzzle';
const MAX_SIDE = 40;

function loadStored(): Puzzle | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Puzzle;
    if (
      typeof p?.width !== 'number' ||
      typeof p?.height !== 'number' ||
      !Array.isArray(p.rows) ||
      !Array.isArray(p.cols) ||
      p.rows.length !== p.height ||
      p.cols.length !== p.width
    ) {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

/** Grows or shrinks the clue lists to match a new grid size, keeping what still fits. */
function resized(puzzle: Puzzle, width: number, height: number): Puzzle {
  const fit = (lists: number[][], n: number) =>
    Array.from({ length: n }, (_, i) => lists[i] ?? []);
  return { width, height, rows: fit(puzzle.rows, height), cols: fit(puzzle.cols, width) };
}

export default function App() {
  const [puzzle, setPuzzle] = useState<Puzzle>(() => loadStored() ?? samplePuzzle(SAMPLES[0]));
  const [result, setResult] = useState<SolveResult | null>(null);
  const [solving, setSolving] = useState(false);

  const playback = usePlayback(result?.steps.length ?? 0);
  const problems = useMemo(() => validatePuzzle(puzzle), [puzzle]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(puzzle));
    } catch {
      // A full or disabled localStorage is not worth interrupting the user over.
    }
  }, [puzzle]);

  /** Any edit invalidates the previous solve. */
  const editPuzzle = useCallback((next: Puzzle) => {
    setPuzzle(next);
    setResult(null);
  }, []);

  const handleClues = useCallback(
    (axis: Axis, index: number, clues: number[]) => {
      setPuzzle((p) => {
        const key = axis === 'row' ? 'rows' : 'cols';
        const lists = [...p[key]];
        lists[index] = clues;
        return { ...p, [key]: lists };
      });
      setResult(null);
    },
    [],
  );

  const handleSolve = useCallback(() => {
    setSolving(true);
    playback.pause();
    // Yield a frame so the button repaints before the (synchronous) solve blocks.
    window.setTimeout(() => {
      const solved = solveAll(puzzle);
      setResult(solved);
      setSolving(false);
      playback.setIndex(solved.steps.length);
    }, 0);
  }, [puzzle, playback]);

  const displayGrid = useMemo(
    () =>
      result
        ? applySteps(puzzle, result.steps, playback.index)
        : emptyGrid(puzzle.width, puzzle.height),
    [result, puzzle, playback.index],
  );

  const currentStep =
    result && playback.index > 0 ? result.steps[playback.index - 1] : undefined;

  const highlighted = useMemo(() => {
    const set = new Set<number>();
    for (const ch of currentStep?.changes ?? []) set.add(idx(puzzle.width, ch.r, ch.c));
    return set;
  }, [currentStep, puzzle.width]);

  // Space / arrow keys drive playback when focus is not in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      if (target?.isContentEditable) return;
      if (e.key === ' ') {
        e.preventDefault();
        playback.toggle();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        playback.stepForward();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        playback.stepBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playback]);

  const fatal = problems.some((p) => p.axis !== 'puzzle');

  return (
    <div className="app">
      <header className="masthead">
        <h1>Nonogram Solver</h1>
        <p>
          Click a row or column header to type its clues (e.g. <code>3 1 2</code>), then solve —
          instantly, or one deduction at a time.
        </p>
      </header>

      <div className="setup">
        <label className="field">
          Width
          <input
            type="number"
            min={1}
            max={MAX_SIDE}
            value={puzzle.width}
            onChange={(e) => {
              const w = Math.max(1, Math.min(MAX_SIDE, Number(e.target.value) || 1));
              editPuzzle(resized(puzzle, w, puzzle.height));
            }}
          />
        </label>
        <label className="field">
          Height
          <input
            type="number"
            min={1}
            max={MAX_SIDE}
            value={puzzle.height}
            onChange={(e) => {
              const h = Math.max(1, Math.min(MAX_SIDE, Number(e.target.value) || 1));
              editPuzzle(resized(puzzle, puzzle.width, h));
            }}
          />
        </label>
        <label className="field field-wide">
          Sample
          <select
            value=""
            onChange={(e) => {
              const sample = SAMPLES[Number(e.target.value)];
              if (sample) editPuzzle(samplePuzzle(sample));
            }}
          >
            <option value="">Load a puzzle…</option>
            {SAMPLES.map((s, i) => (
              <option key={s.name} value={i}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="setup-action"
          onClick={() =>
            editPuzzle(
              resized({ width: 0, height: 0, rows: [], cols: [] }, puzzle.width, puzzle.height),
            )
          }
        >
          Clear clues
        </button>
      </div>

      {problems.length > 0 && (
        <ul className="problems">
          {problems.map((p, i) => (
            <li key={i}>{p.message}</li>
          ))}
        </ul>
      )}

      <main className="layout">
        <section className="board">
          <PuzzleGrid
            puzzle={puzzle}
            grid={displayGrid}
            highlighted={highlighted}
            activeLine={currentStep?.line}
            problems={problems}
            onCluesChange={handleClues}
          />
          <Controls
            playback={playback}
            result={result}
            solving={solving}
            canSolve={!fatal}
            onSolve={handleSolve}
          />
        </section>

        <LogPanel
          steps={result?.steps ?? []}
          index={playback.index}
          onJump={playback.setIndex}
        />
      </main>
    </div>
  );
}
