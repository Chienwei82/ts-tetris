import { describe, expect, it } from 'vitest';
import { clearFullRows, createGrid } from '../src/game/board.js';
import { COLS, TOTAL_ROWS } from '../src/game/types.js';
import type { Grid } from '../src/game/types.js';

function fillRow(grid: Grid, row: number): void {
  for (let c = 0; c < COLS; c++) grid[row]![c] = 'I';
}

describe('clearFullRows', () => {
  it('collapses the rows above downward and adds an empty row on top', () => {
    const g = createGrid();
    fillRow(g, 1);
    g[3]![2] = 'T'; // marker two rows above the cleared one
    const cleared = clearFullRows(g);
    expect(cleared).toEqual([1]);
    expect(g).toHaveLength(TOTAL_ROWS);
    expect(g[TOTAL_ROWS - 1]!.every((v) => v === 0)).toBe(true);
    expect(g[2]![2]).toBe('T'); // marker fell exactly one row
  });

  it('clears several non-consecutive rows and returns ascending indices', () => {
    const g = createGrid();
    fillRow(g, 0);
    fillRow(g, 2);
    fillRow(g, 5);
    const cleared = clearFullRows(g);
    expect(cleared).toEqual([0, 2, 5]);
    expect(g).toHaveLength(TOTAL_ROWS);
    expect(g.every((row) => row.every((v) => v === 0))).toBe(true);
  });

  it('leaves partial rows untouched', () => {
    const g = createGrid();
    fillRow(g, 4);
    g[4]![7] = 0;
    expect(clearFullRows(g)).toEqual([]);
    expect(g[4]![7]).toBe(0);
  });
});