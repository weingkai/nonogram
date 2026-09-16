// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { SAMPLES } from './samples';

const filledCount = () => document.querySelectorAll('.cell.filled').length;
const emptyCount = () => document.querySelectorAll('.cell.empty').length;
const unknownCount = () => document.querySelectorAll('.cell.unknown').length;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('the page', () => {
  it('starts on the heart sample with a blank grid and an empty log', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Nonogram Solver' })).toBeInTheDocument();
    expect(unknownCount()).toBe(81); // 9 × 9
    expect(filledCount()).toBe(0);
    expect(screen.getByText(/Every deduction the solver makes/)).toBeInTheDocument();
  });

  it('solves the sample and draws the picture', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Solve' }));

    expect(await screen.findByText(/^Solved in \d+ steps/)).toBeInTheDocument();
    const expectedFilled = SAMPLES[0].art.join('').split('#').length - 1;
    expect(filledCount()).toBe(expectedFilled);
    expect(unknownCount()).toBe(0);
  });

  it('replays the solve one step at a time', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Solve' }));
    await screen.findByText(/^Solved in/);

    await user.click(screen.getByRole('button', { name: /Reset/ }));
    expect(filledCount() + emptyCount()).toBe(0);

    await user.click(screen.getByRole('button', { name: /^Step ▶/ }));
    const afterOne = filledCount() + emptyCount();
    expect(afterOne).toBeGreaterThan(0);
    expect(unknownCount()).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /^◀ Step/ }));
    expect(filledCount() + emptyCount()).toBe(0);

    await user.click(screen.getByRole('button', { name: /Skip to end/ }));
    expect(unknownCount()).toBe(0);
  });

  it('explains each deduction and lets you jump to one', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Solve' }));
    await screen.findByText(/^Solved in/);

    const log = screen.getByRole('list', { name: '' }) ?? document.querySelector('.log-list')!;
    const entries = within(log as HTMLElement).getAllByRole('listitem');
    expect(entries.length).toBeGreaterThan(5);
    expect(entries[0].textContent).toMatch(/(Row|Column) \d+ \[.*\]:/);

    await user.click(entries[2]);
    expect(screen.getByText(/^Step 3 \//)).toBeInTheDocument();
    expect(unknownCount()).toBeGreaterThan(0);
  });

  it('accepts clues typed into a header and advances with Enter', async () => {
    const user = userEvent.setup();
    render(<App />);

    const rowHeader = document.querySelectorAll('.clue-row')[0] as HTMLElement;
    await user.click(rowHeader);
    // The editor is portalled to <body>, so it escapes the grid's scroll clipping.
    const input = screen.getByRole('textbox', { name: 'Row 1 clues' });
    expect(input.closest('.clue-editor')?.parentElement).toBe(document.body);
    await user.clear(input);
    await user.type(input, '4 4');
    expect(input).toHaveValue('4 4');
    expect(rowHeader.textContent).toBe('44');

    await user.keyboard('{Enter}');
    expect(screen.getByRole('textbox', { name: 'Row 2 clues' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(rowHeader.textContent).toBe('44');
  });

  it('reports a puzzle with no solution instead of hanging', async () => {
    const user = userEvent.setup();
    render(<App />);

    // 3x3: rows want 2 filled cells, columns want 3.
    await user.clear(screen.getByLabelText('Width'));
    await user.type(screen.getByLabelText('Width'), '3');
    await user.clear(screen.getByLabelText('Height'));
    await user.type(screen.getByLabelText('Height'), '3');
    await user.click(screen.getByRole('button', { name: 'Clear clues' }));

    for (const [axis, i, text] of [
      ['row', 0, '1'],
      ['row', 1, '1'],
      ['col', 0, '1'],
      ['col', 1, '1'],
      ['col', 2, '1'],
    ] as const) {
      await user.click(document.querySelectorAll(`.clue-${axis}`)[i] as HTMLElement);
      await user.type(screen.getByRole('textbox'), text);
      await user.keyboard('{Escape}');
    }

    expect(screen.getByText(/Row clues total 2 filled cells but column clues total 3/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Solve' }));
    // Reported both in the outcome banner and as the closing entry in the log.
    expect(await screen.findAllByText('No solution exists for these clues.')).toHaveLength(2);
    expect(document.querySelector('.outcome-unsolvable')).toBeInTheDocument();
  });

  it('blocks solving when a clue cannot fit, and says why', async () => {
    const user = userEvent.setup();
    render(<App />);

    const rowHeader = document.querySelectorAll('.clue-row')[0] as HTMLElement;
    await user.click(rowHeader);
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), '5 5');
    await user.keyboard('{Escape}');

    expect(screen.getByText(/Row 1 needs at least 11 cells but the grid is 9 wide/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Solve' })).toBeDisabled();
  });

  it('keeps the puzzle across a reload', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    const rowHeader = document.querySelectorAll('.clue-row')[0] as HTMLElement;
    await user.click(rowHeader);
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), '7');
    await user.keyboard('{Escape}');
    unmount();

    render(<App />);
    expect((document.querySelectorAll('.clue-row')[0] as HTMLElement).textContent).toBe('7');
  });
});

describe('on a phone-sized viewport', () => {
  const setViewport = (width: number) => {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 667, configurable: true });
    window.dispatchEvent(new Event('resize'));
  };

  beforeEach(() => setViewport(375));
  afterEach(() => setViewport(1024));

  it('docks the clue editor to the top instead of floating beside a header', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(document.querySelectorAll('.clue-col')[0] as HTMLElement);
    const box = document.querySelector('.clue-editor') as HTMLElement;

    expect(box).toHaveClass('docked');
    expect(box.style.width).toBe('359px'); // viewport minus an 8px gutter each side
    expect(box.style.left).toBe('8px');
    expect(box.style.top).toBe('8px');
    expect(box).toHaveTextContent('Column 1');
  });

  it('can be driven entirely by touch, with no keyboard', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(document.querySelectorAll('.clue-row')[0] as HTMLElement);
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), '2 2');

    await user.click(screen.getByRole('button', { name: 'Next line' }));
    expect(screen.getByRole('textbox', { name: 'Row 2 clues' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous line' }));
    expect(screen.getByRole('textbox', { name: 'Row 1 clues' })).toHaveValue('2 2');

    await user.click(screen.getByRole('button', { name: 'Done editing clues' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect((document.querySelectorAll('.clue-row')[0] as HTMLElement).textContent).toBe('22');
  });

  it('flags an invalid clue as you type it', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(document.querySelectorAll('.clue-row')[0] as HTMLElement);
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), '3 x');

    expect(document.querySelector('.clue-editor')).toHaveClass('invalid');
    // The bad text is not committed to the puzzle.
    expect((document.querySelectorAll('.clue-row')[0] as HTMLElement).textContent).toBe('3');
  });
});
