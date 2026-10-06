import * as THREE from 'three';
import { COLS, VISIBLE_ROWS } from '../game/types.js';
export const CELL = 1;
export const BOARD_W = COLS * CELL;
export const BOARD_H = VISIBLE_ROWS * CELL;
export const BOARD_D = 1;
/** FOV vertical de la cámara (grados); la usa el encuadre (`framing.ts`). */
export const CAMERA_FOV = 40;
/** world pos of cell (col,row bottom-based) -> centered on board */
export function cellToWorld(col: number, row: number): { x: number; y: number } {
  return { x: col - COLS / 2 + 0.5, y: row - VISIBLE_ROWS / 2 + 0.5 };
}

/**
 * Píxeles de pantalla que ocupa una celda del tablero: proyecta dos celdas
 * adyacentes con la cámara actual. Lo usan los gestos táctiles para convertir
 * el desplazamiento del dedo en pasos de celda.
 */
export function pxPerCell(camera: THREE.PerspectiveCamera, canvas: HTMLElement): { x: number; y: number } {
  const w = canvas.clientWidth || window.innerWidth || 1;
  const h = canvas.clientHeight || window.innerHeight || 1;
  camera.updateMatrixWorld();
  const base = cellToWorld(0, 0);
  const right = cellToWorld(1, 0);
  const up = cellToWorld(0, 1);
  const a = new THREE.Vector3(base.x, base.y, 0).project(camera);
  const b = new THREE.Vector3(right.x, right.y, 0).project(camera);
  const c = new THREE.Vector3(up.x, up.y, 0).project(camera);
  return {
    x: Math.max(1, Math.abs(((b.x - a.x) * w) / 2)),
    y: Math.max(1, Math.abs(((c.y - a.y) * h) / 2))
  };
}
