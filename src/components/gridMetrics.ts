const MAX_CELL = 32;
const MIN_CELL = 13;
const MIN_CLUE_FONT = 9;

/** Used until the first measurement of the grid container arrives. */
export const ASSUMED_WIDTH = 620;

export interface GridMetrics {
  cell: number;
  clueFont: number;
  rowHeader: number;
  colHeader: number;
}

/**
 * Picks the largest cell size whose grid still fits the space we have, shrinking the
 * clue headers and their type along with it. Below {@link MIN_CELL} we stop shrinking
 * and let the grid scroll sideways instead — a 40-wide puzzle on a phone is going to
 * scroll whatever we do, and unreadable cells help nobody.
 */
export function gridMetrics(
  available: number,
  width: number,
  rowDepth: number,
  colDepth: number,
): GridMetrics {
  const build = (cell: number): GridMetrics => {
    const clueFont = Math.max(MIN_CLUE_FONT, Math.round(cell * 0.52));
    return {
      cell,
      clueFont,
      // A clue is at most two digits, plus the flex gap between them.
      rowHeader: Math.round(Math.max(1.9 * cell, rowDepth * (clueFont * 1.25 + 4) + 10)),
      colHeader: Math.round(Math.max(1.9 * cell, colDepth * (clueFont * 1.1 + 3) + 8)),
    };
  };

  for (let cell = MAX_CELL; cell > MIN_CELL; cell--) {
    const metrics = build(cell);
    if (metrics.rowHeader + width * cell <= available) return metrics;
  }
  return build(MIN_CELL);
}
