// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import App from './App';

/**
 * jsdom applies no stylesheet by default, so these tests inject the real one and then
 * read computed styles. That covers cascade order — which is where a sticky row header
 * silently lost to `.clue-cell { position: relative }`.
 *
 * jsdom does not evaluate media queries, so only the unconditional rules are checked
 * here; the responsive sizing maths lives in PuzzleGrid.test.ts.
 */
let style: HTMLStyleElement;

beforeAll(() => {
  style = document.createElement('style');
  style.textContent = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
  document.head.appendChild(style);
});

afterAll(() => style.remove());
afterEach(cleanup);

const computed = (selector: string, property: string) => {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`no element matched ${selector}`);
  return getComputedStyle(el).getPropertyValue(property);
};

describe('stylesheet', () => {
  beforeAll(() => {
    localStorage.clear();
  });

  it('keeps the row clue headers pinned while a wide grid scrolls sideways', () => {
    render(<App />);
    // `.clue-cell` sets `position: relative` and is declared after `.clue-row`, so this
    // only holds because `.clue-row` re-declares its own position further down the file.
    expect(computed('.clue-row', 'position')).toBe('sticky');
    expect(computed('.clue-row', 'left')).toBe('0px');
    expect(computed('.corner', 'position')).toBe('sticky');
  });

  it('confines an oversized grid to its own scroll container', () => {
    render(<App />);
    expect(computed('.grid-wrap', 'overflow-x')).toBe('auto');
  });

  it('never lets a clue number shrink below a legible size', () => {
    render(<App />);
    // The font size is driven by the --clue-font custom property, floored in gridMetrics.
    expect(computed('.clue-cell', 'font-size')).toBe('var(--clue-font)');
  });
});
