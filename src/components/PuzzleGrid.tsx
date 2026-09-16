import { useState } from 'react';
import { useElementWidth } from '../hooks/useElementWidth';
import { formatClues, parseClues, type PuzzleProblem } from '../solver/clues';
import { FILLED, EMPTY, idx, type Axis, type Grid, type LineRef, type Puzzle } from '../solver/types';
import { ClueEditor } from './ClueEditor';
import { ASSUMED_WIDTH, gridMetrics } from './gridMetrics';

interface Props {
  puzzle: Puzzle;
  grid: Grid;
  /** Flat grid indices touched by the step currently showing. */
  highlighted: Set<number>;
  activeLine?: LineRef;
  problems: PuzzleProblem[];
  /** Clue lines a photo import was unsure about, as `"row-3"` keys. */
  uncertain?: Set<string>;
  onCluesChange: (axis: Axis, index: number, clues: number[]) => void;
}

interface Editing {
  axis: Axis;
  index: number;
  anchor: HTMLElement | null;
}

export function PuzzleGrid({
  puzzle,
  grid,
  highlighted,
  activeLine,
  problems,
  uncertain,
  onCluesChange,
}: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState('');
  const [wrapRef, wrapWidth] = useElementWidth<HTMLDivElement>();

  const { width, height, rows, cols } = puzzle;
  const cluesFor = (axis: Axis, index: number) => (axis === 'row' ? rows : cols)[index] ?? [];

  const rowDepth = Math.max(1, ...rows.map((c) => c.length));
  const colDepth = Math.max(1, ...cols.map((c) => c.length));
  const metrics = gridMetrics(wrapWidth || ASSUMED_WIDTH, width, rowDepth, colDepth);

  const badLines = new Set(
    problems.filter((p) => p.axis !== 'puzzle').map((p) => `${p.axis}-${p.index}`),
  );

  const beginEdit = (axis: Axis, index: number, anchor: HTMLElement | null) => {
    if (editing?.axis === axis && editing.index === index) return;
    setEditing({ axis, index, anchor });
    setDraft(formatClues(cluesFor(axis, index)));
  };

  const move = (delta: number) => {
    if (!editing) return;
    const { axis } = editing;
    const next = editing.index + delta;
    if (next < 0 || next >= (axis === 'row' ? height : width)) {
      setEditing(null);
      return;
    }
    const anchor = document.querySelector<HTMLElement>(
      `[data-line="${axis}-${next}"]`,
    );
    setEditing({ axis, index: next, anchor });
    setDraft(formatClues(cluesFor(axis, next)));
  };

  const headerProps = (axis: Axis, index: number) => ({
    'data-line': `${axis}-${index}`,
    role: 'button' as const,
    tabIndex: 0,
    onClick: (e: React.MouseEvent<HTMLDivElement>) => beginEdit(axis, index, e.currentTarget),
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Keystrokes from the editor can bubble through here; ignore them.
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        beginEdit(axis, index, e.currentTarget);
      }
    },
  });

  const clueText = (clues: number[]) => (clues.length ? clues : [0]);

  return (
    <div
      ref={wrapRef}
      className="grid-wrap"
      style={
        {
          '--cell': `${metrics.cell}px`,
          '--clue-font': `${metrics.clueFont}px`,
          '--row-header': `${metrics.rowHeader}px`,
          '--col-header': `${metrics.colHeader}px`,
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
          <span>
            {width}×{height}
          </span>
        </div>

        {Array.from({ length: width }, (_, c) => (
          <div
            key={`ch-${c}`}
            {...headerProps('col', c)}
            className={[
              'clue-cell',
              'clue-col',
              c % 5 === 0 ? 'major' : '',
              activeLine?.axis === 'col' && activeLine.index === c ? 'active' : '',
              badLines.has(`col-${c}`) ? 'invalid' : '',
              uncertain?.has(`col-${c}`) ? 'uncertain' : '',
              editing?.axis === 'col' && editing.index === c ? 'editing' : '',
            ].join(' ')}
          >
            {clueText(cols[c] ?? []).map((n, i) => (
              <span key={i}>{n}</span>
            ))}
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
            uncertain={uncertain?.has(`row-${r}`) ?? false}
            editing={editing?.axis === 'row' && editing.index === r}
            headerProps={headerProps}
            clueText={clueText}
          />
        ))}
      </div>

      {editing && (
        <ClueEditor
          axis={editing.axis}
          index={editing.index}
          anchor={editing.anchor}
          value={draft}
          valid={parseClues(draft) !== null}
          onChange={(value) => {
            setDraft(value);
            // Commit live, so the grid always reflects what is legible in the box.
            const parsed = parseClues(value);
            if (parsed) onCluesChange(editing.axis, editing.index, parsed);
          }}
          onMove={move}
          onClose={() => setEditing(null)}
          onBlur={(axis, index) =>
            setEditing((cur) => (cur?.axis === axis && cur.index === index ? null : cur))
          }
        />
      )}
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
  uncertain: boolean;
  editing: boolean;
  headerProps: (axis: Axis, index: number) => Record<string, unknown>;
  clueText: (clues: number[]) => number[];
}

function Row({
  r,
  puzzle,
  grid,
  highlighted,
  activeLine,
  invalid,
  uncertain,
  editing,
  headerProps,
  clueText,
}: RowProps) {
  const { width, rows } = puzzle;
  const rowActive = activeLine?.axis === 'row' && activeLine.index === r;

  return (
    <>
      <div
        {...headerProps('row', r)}
        className={[
          'clue-cell',
          'clue-row',
          r % 5 === 0 ? 'major' : '',
          rowActive ? 'active' : '',
          invalid ? 'invalid' : '',
          uncertain ? 'uncertain' : '',
          editing ? 'editing' : '',
        ].join(' ')}
      >
        {clueText(rows[r] ?? []).map((n, i) => (
          <span key={i}>{n}</span>
        ))}
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
