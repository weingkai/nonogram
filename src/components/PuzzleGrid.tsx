import { useState } from 'react';
import { formatClues, parseClues, type PuzzleProblem } from '../solver/clues';
import { FILLED, EMPTY, idx, type Axis, type Grid, type LineRef, type Puzzle } from '../solver/types';

interface Props {
  puzzle: Puzzle;
  grid: Grid;
  /** Flat grid indices touched by the step currently showing. */
  highlighted: Set<number>;
  activeLine?: LineRef;
  problems: PuzzleProblem[];
  onCluesChange: (axis: Axis, index: number, clues: number[]) => void;
}

interface Editing {
  axis: Axis;
  index: number;
}

export function PuzzleGrid({
  puzzle,
  grid,
  highlighted,
  activeLine,
  problems,
  onCluesChange,
}: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState('');

  const { width, height, rows, cols } = puzzle;
  const cluesFor = (axis: Axis, index: number) => (axis === 'row' ? rows : cols)[index] ?? [];

  const rowDepth = Math.max(1, ...rows.map((c) => c.length));
  const colDepth = Math.max(1, ...cols.map((c) => c.length));
  const cell = Math.max(15, Math.min(30, Math.floor(620 / Math.max(width, height))));
  const clueStep = cell * 0.55 + 3;
  const colHeader = Math.max(2.2 * cell, colDepth * clueStep + 8);
  const rowHeader = Math.max(2.2 * cell, rowDepth * (clueStep + cell * 0.2) + 10);

  const badLines = new Set(
    problems.filter((p) => p.axis !== 'puzzle').map((p) => `${p.axis}-${p.index}`),
  );

  const beginEdit = (axis: Axis, index: number) => {
    // Clicks inside the open input bubble up to the header cell; ignore those.
    if (editing?.axis === axis && editing.index === index) return;
    setEditing({ axis, index });
    setDraft(formatClues(cluesFor(axis, index)));
  };

  const move = (delta: number) => {
    if (!editing) return;
    const max = editing.axis === 'row' ? height : width;
    const next = editing.index + delta;
    if (next >= 0 && next < max) beginEdit(editing.axis, next);
    else setEditing(null);
  };

  const editor = (axis: Axis, index: number) => (
    <input
      key={`${axis}-${index}`}
      className={`clue-input clue-input-${axis}`}
      autoFocus
      value={draft}
      spellCheck={false}
      aria-label={`${axis === 'row' ? 'Row' : 'Column'} ${index + 1} clues`}
      onChange={(e) => {
        const value = e.target.value;
        setDraft(value);
        // Commit live, so the grid always reflects what is legible in the box.
        const parsed = parseClues(value);
        if (parsed) onCluesChange(axis, index, parsed);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          move(e.shiftKey ? -1 : 1);
        } else if (e.key === 'Tab') {
          e.preventDefault();
          move(e.shiftKey ? -1 : 1);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setEditing(null);
        }
      }}
      // Only close if focus left the cell we are still editing — moving on re-focuses.
      onBlur={() => setEditing((cur) => (cur?.axis === axis && cur.index === index ? null : cur))}
    />
  );

  const isEditing = (axis: Axis, index: number) =>
    editing?.axis === axis && editing.index === index;

  const clueText = (clues: number[]) => (clues.length ? clues : [0]);

  return (
    <div
      className="grid-wrap"
      style={
        {
          '--cell': `${cell}px`,
          '--row-header': `${rowHeader}px`,
          '--col-header': `${colHeader}px`,
        } as React.CSSProperties
      }
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `var(--row-header) repeat(${width}, var(--cell))`,
          gridTemplateRows: `var(--col-header) repeat(${height}, var(--cell))`,
        }}
      >
        <div className="corner">
          <span>{width}×{height}</span>
        </div>

        {Array.from({ length: width }, (_, c) => (
          <div
            key={`ch-${c}`}
            className={[
              'clue-cell',
              'clue-col',
              c % 5 === 0 ? 'major' : '',
              activeLine?.axis === 'col' && activeLine.index === c ? 'active' : '',
              badLines.has(`col-${c}`) ? 'invalid' : '',
            ].join(' ')}
            onClick={() => beginEdit('col', c)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              // Keystrokes from the open editor bubble through here — ignore them,
              // or typing a space would be swallowed by this handler.
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                beginEdit('col', c);
              }
            }}
          >
            {isEditing('col', c)
              ? editor('col', c)
              : clueText(cols[c] ?? []).map((n, i) => <span key={i}>{n}</span>)}
          </div>
        ))}

        {Array.from({ length: height }, (_, r) => (
          <Row
            key={`r-${r}`}
            r={r}
            puzzle={puzzle}
            grid={grid}
            highlighted={highlighted}
            activeLine={activeLine}
            invalid={badLines.has(`row-${r}`)}
            editing={isEditing('row', r)}
            editor={editor}
            beginEdit={beginEdit}
            clueText={clueText}
          />
        ))}
      </div>
    </div>
  );
}

interface RowProps {
  r: number;
  puzzle: Puzzle;
  grid: Grid;
  highlighted: Set<number>;
  activeLine?: LineRef;
  invalid: boolean;
  editing: boolean;
  editor: (axis: Axis, index: number) => React.ReactNode;
  beginEdit: (axis: Axis, index: number) => void;
  clueText: (clues: number[]) => number[];
}

function Row({
  r,
  puzzle,
  grid,
  highlighted,
  activeLine,
  invalid,
  editing,
  editor,
  beginEdit,
  clueText,
}: RowProps) {
  const { width, rows } = puzzle;
  const rowActive = activeLine?.axis === 'row' && activeLine.index === r;

  return (
    <>
      <div
        className={[
          'clue-cell',
          'clue-row',
          r % 5 === 0 ? 'major' : '',
          rowActive ? 'active' : '',
          invalid ? 'invalid' : '',
        ].join(' ')}
        onClick={() => beginEdit('row', r)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            beginEdit('row', r);
          }
        }}
      >
        {editing ? editor('row', r) : clueText(rows[r] ?? []).map((n, i) => <span key={i}>{n}</span>)}
      </div>

      {Array.from({ length: width }, (_, c) => {
        const flat = idx(width, r, c);
        const value = grid[flat];
        const colActive = activeLine?.axis === 'col' && activeLine.index === c;
        return (
          <div
            key={`c-${r}-${c}`}
            className={[
              'cell',
              value === FILLED ? 'filled' : value === EMPTY ? 'empty' : 'unknown',
              r % 5 === 0 ? 'major-top' : '',
              c % 5 === 0 ? 'major-left' : '',
              rowActive || colActive ? 'in-line' : '',
              highlighted.has(flat) ? 'just-changed' : '',
            ].join(' ')}
          />
        );
      })}
    </>
  );
}
