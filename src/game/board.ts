import { COLS, TOTAL_ROWS } from './types.js';
import type { CellValue, Grid, PieceKind, Vec2 } from './types.js';

export function createGrid(): Grid {
  const grid: Grid = [];
  for (let r = 0; r < TOTAL_ROWS; r++) {
    grid.push(new Array<CellValue>(COLS).fill(0));
  }
  return grid;
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => [...row]);
}

/** True if any cell is outside the walls/floor or overlaps a locked block. */
export function collides(grid: Grid, cells: Vec2[]): boolean {
  for (const c of cells) {
    if (c.x < 0 || c.x >= COLS) return true;
    if (c.y < 0) return true; // floor
    if (c.y >= TOTAL_ROWS) return true; // ceiling of hidden buffer
    const row = grid[c.y];
    if (row === undefined) return true;
    if (row[c.x] !== 0 && row[c.x] !== undefined) return true;
  }
  return false;
}

export function mergePiece(grid: Grid, cells: Vec2[], kind: PieceKind): void {
  for (const c of cells) {
    if (c.y >= 0 && c.y < TOTAL_ROWS && c.x >= 0 && c.x < COLS) {
      const row = grid[c.y];
      if (row !== undefined) row[c.x] = kind;
    }
  }
}

/** Removes full rows (only rows 0..TOTAL-1). Returns cleared row indices (bottom-based). */
export function clearFullRows(grid: Grid): number[] {
  const cleared: number[] = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (row !== undefined && row.every((v) => v !== 0)) cleared.push(r);
  }
  // Remove from top down so indices stay valid.
  cleared.sort((a, b) => b - a);
  for (const r of cleared) {
    grid.splice(r, 1);
    grid.push(new Array<CellValue>(COLS).fill(0));
  }
  return cleared.sort((a, b) => a - b);
}

/** Highest occupied row (-1 when empty). */
export function stackHeight(grid: Grid): number {
  for (let r = grid.length - 1; r >= 0; r--) {
    const row = grid[r];
    if (row !== undefined && row.some((v) => v !== 0)) return r;
  }
  return -1;
}
