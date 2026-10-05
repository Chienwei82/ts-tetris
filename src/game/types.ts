export type PieceKind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export interface Vec2 {
  x: number;
  y: number;
}

export type RotationState = 0 | 1 | 2 | 3;

/** Board dimensions: 10 cols x 20 visible rows (+ hidden spawn buffer). */
export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 2;
export const TOTAL_ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

export type CellValue = PieceKind | 0;
export type Grid = CellValue[][]; // grid[row][col], row 0 = bottom

export interface ActivePiece {
  kind: PieceKind;
  rotation: RotationState;
  /** Board coords of the piece origin (col, row from bottom). */
  x: number;
  y: number;
}

export type GamePhase = 'ready' | 'playing' | 'paused' | 'gameover';

export type GameEventType =
  | 'move'
  | 'rotate'
  | 'lock'
  | 'clear'
  | 'harddrop'
  | 'levelup'
  | 'gameover'
  | 'hold'
  | 'combo';

export interface GameEvent {
  type: GameEventType;
  lines?: number;
  cells?: Vec2[];
  rows?: number[];
  scoreGained?: number;
  level?: number;
}

export const ALL_KINDS: PieceKind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export const PIECE_COLORS: Record<PieceKind, number> = {
  I: 0x46c6d4, // papel aqua
  O: 0xffcb3d, // papel amarillo
  T: 0xb477e6, // papel uva
  S: 0x63c26b, // papel verde hoja
  Z: 0xe4573f, // papel rojo
  J: 0x4d8fe0, // papel azul
  L: 0xf2953a  // papel naranja
};

export const LINE_POINTS = [0, 100, 300, 500, 800] as const;

/** Lines needed to advance one level (classic rule). */
export const LINES_PER_LEVEL = 10;
/** Seconds of play that advance one level even without clearing lines. */
export const SECONDS_PER_LEVEL = 45;
/** Level cap: gravity, gauge and stage themes stop progressing here. */
export const MAX_LEVEL = 20;

export interface LevelProgress {
  /** 0..1 progress toward the next level (largest of lines/time). */
  ratio: number;
  /** Which rule is currently ahead. */
  source: 'lines' | 'time';
  /** True when the level cap has been reached. */
  atMax: boolean;
}
