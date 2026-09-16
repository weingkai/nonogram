# Nonogram Solver

A local web app for solving nonograms (griddlers / picross). Type the row and column
clues into the grid headers and watch it solve — instantly, or one deduction at a time
with an explanation for each move.

## Running it

```sh
npm install
npm run setup:ocr   # one-off: vendors the OCR engine for the photo import
npm run dev         # then open the printed http://localhost:5173
```

Other scripts: `npm test` (solver, photo pipeline and UI tests), `npm run build`,
`npm run lint`.

## Publishing it

Pushing to `main` deploys the app to GitHub Pages via `.github/workflows/deploy.yml`,
which type-checks, lints and runs the tests first. On a public repository this costs
nothing. One-time setup: in the repository's **Settings → Pages**, set **Source** to
**GitHub Actions**.

Two details make it work from a project-page URL like `https://<you>.github.io/nonogram/`:

- `vite.config.ts` reads `BASE_PATH`, which the workflow sets from the repository name —
  so renaming or forking the repo needs no edit. Locally it stays `/`.
- `public/tesseract/` is gitignored, so the workflow runs `npm run setup:ocr` before
  building. Anything referencing those assets at run time must go through
  `import.meta.env.BASE_URL`, as `src/photo/ocr.ts` does.

To check a production build locally:

```sh
BASE_PATH=/nonogram/ npm run build
BASE_PATH=/nonogram/ npx vite preview     # serves at /nonogram/
```

### Third-party components

tesseract.js, tesseract.js-core and the English training data are Apache-2.0; React and
Vite are MIT. All are permissive, so publishing is straightforward — but this repository
has no licence of its own yet, so add one if you want others to be able to use it.

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

- **Load from a photo** reads the clues off a screenshot or a photo of a puzzle. See
  below for how far to trust it.

It works on a phone: the grid sizes its cells to the space available, the clue editor
docks to the top of the screen with ‹ › ✓ buttons so you never need a keyboard, and the
row clues stay pinned while a wide puzzle scrolls sideways.

Problems that make a puzzle unsolvable before it starts — a clue too long for its line,
or row and column totals that disagree — are flagged above the grid.

## Loading a puzzle from a photo

**Load from photo** takes a picture — chosen, dragged, pasted, or shot with the camera on
a phone — and fills in the clues. It runs entirely on your machine; nothing is uploaded and
no API key is needed.

`npm run setup:ocr` vendors the tesseract.js engine into `public/tesseract/` (about 30MB,
gitignored). It copies the wasm from `node_modules` and downloads the English model once,
after which the import works with no network at all.

### How it reads a puzzle

1. **Prepare** — grayscale, then divide out a heavily blurred copy of the image. That
   removes page shading and soft shadows, so one threshold works across the whole picture.
2. **Straighten** — scans are rarely square, and grid detection tolerates only about half a
   degree of tilt, so the skew angle is found by rotating until the ink piles up most
   sharply into rows.
3. **Find the grid** — for each column, the longest unbroken run of ink. A grid rule runs
   nearly the height of the grid; a clue digit never comes close, so a simple threshold
   separates them. The line positions are then refitted to an exact pitch, which recovers
   faint rules and discards strays like a page border. This yields the grid rectangle and
   the puzzle's size for free.
4. **Trim the clue bands** — if the puzzle rules its clue areas like a table, those
   separators look like grid lines too. The grid proper is the one region with no *interior*
   ink, since clue cells hold digits and grid cells do not.
5. **Read** — one OCR pass per clue line, on a crop of just that line. This matters twice
   over: tesseract only reliably reads an isolated digit when given nothing else, and a
   digit cannot be attributed to the wrong line if the image *is* the line.
6. **Group** — digits are placed into clues by which cell of the lattice they fall in,
   never by tesseract's own word boundaries. Two clues side by side otherwise come back as
   one number, and a wide two-digit clue comes back as two.

### How far to trust it

Not completely, which is why the import shows its work before changing anything: the
thresholded image with the detected grid drawn over it, the size it found, and everything
it read. Three checks run automatically — per-line OCR confidence, whether the row and
column clue totals agree, and whether the grid it found is plausible. Lines it is unsure
about are highlighted in the puzzle for you to check, and the highlight clears when you
edit the line.

If the size comes out wrong, correct it in the import dialog and the clues are re-read at
the new size. Flat screenshots and scans read most reliably; angled or shadowed photos will
sometimes misread.

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

## Testing notes

The photo pipeline is tested against synthetic puzzle images rendered by
`src/photo/__fixtures__/render.ts`, with OCR stubbed, so the geometry is checked without a
camera or a font. `src/photo/ocr.node.test.ts` is the exception: it runs the real tesseract
engine in Node against a puzzle drawn with a 5×7 bitmap face, checking the engine settings,
the per-line strips, the box arithmetic and the digit grouping end to end. It asserts clue
*structure* exactly but allows the odd wrong digit, because the fixture font — not
tesseract — is the accuracy limit there. It skips if `npm run setup:ocr` has not been run.
