# Nonogram Solver

A local web app for solving nonograms (griddlers / picross). Type the row and column
clues into the grid headers and watch it solve — instantly, or one deduction at a time
with an explanation for each move.

## Running it

```sh
npm install
npm run dev      # then open the printed http://localhost:5173
```

Other scripts: `npm test` (solver + UI tests), `npm run build`, `npm run lint`.

## Using it

- **Enter clues** by clicking any row or column header and typing the numbers,
  e.g. `3 1 2`. Enter or Tab commits and moves to the next line; Shift reverses;
  Escape closes the editor. Clues save to `localStorage`, so a refresh keeps them.
- **Grid size** is set with the Width/Height boxes (up to 40×40). The **Sample**
  dropdown loads a ready-made puzzle, and **Clear clues** empties the current one.
- **Solve** runs the solver and shows the finished grid. **Reset** then **Play** replays
  it; Step ◀ ▶ moves one deduction at a time and the slider scrubs anywhere in the
  timeline. Space, ← and → work as shortcuts.
- **The reasoning panel** on the right lists every deduction. Click an entry to jump the
  grid to that moment. The line being reasoned about is tinted and the cells it just
  determined are outlined.

It works on a phone: the grid sizes its cells to the space available, the clue editor
docks to the top of the screen with ‹ › ✓ buttons so you never need a keyboard, and the
row clues stay pinned while a wide puzzle scrolls sideways.

Problems that make a puzzle unsolvable before it starts — a clue too long for its line,
or row and column totals that disagree — are flagged above the grid.

## How the solver works

`src/solver/line.ts` holds the core: a **line-complete** solver for one row or column.
It models every legal arrangement of that line's clues as paths through a DAG of states
`(clues remaining, position)`, keeps only the states that are both reachable from the
start and able to reach the end, and reads off which cells are filled — or empty — in
*every* surviving arrangement. Those cells are forced; anything else stays unknown.

`src/solver/solve.ts` runs that over the whole puzzle with a dirty-line queue: solve a
line, and if it changed anything, re-queue the lines crossing the changed cells. Most
human-solvable puzzles finish here with no guessing at all. If the queue empties with
cells still unknown, it picks the unknown cell in the most-constrained line, guesses,
and backtracks on contradiction. A step and time budget stops a pathological puzzle from
hanging the tab.

The solver is a generator that emits a `SolverStep` for each deduction, guess or
backtrack, carrying the cells it changed and a plain-English reason. The UI collects
those steps and replays them, which is why instant solve, animation and the reasoning
log are all the same code path.

## Layout notes

`src/components/gridMetrics.ts` picks the cell size: it measures the grid container
(`useElementWidth`) and takes the largest cell whose grid still fits, scaling the clue
headers and their type with it. Below a 13px floor it stops shrinking and the grid
scrolls horizontally instead.

The clue editor is portalled to `document.body` — anchored inside the grid it would be
clipped by that same horizontal scroll container.
