import { COLS, VISIBLE_ROWS } from '../game/types.js';
export const CELL = 1;
export const BOARD_W = COLS * CELL;
export const BOARD_H = VISIBLE_ROWS * CELL;
export const BOARD_D = 1;
/** world pos of cell (col,row bottom-based) -> centered on board */
export function cellToWorld(col: number, row: number): { x: number; y: number } {
  return { x: col - COLS / 2 + 0.5, y: row - VISIBLE_ROWS / 2 + 0.5 };
}
