import { clearFullRows, collides, createGrid, mergePiece } from './board.js';
import { mulberry32 } from './chaos/rng.js';
import { cellsForPiece, getKicks, shuffledBag } from './pieces.js';
import { COLS, LINES_PER_LEVEL, LINE_POINTS, MAX_LEVEL, SECONDS_PER_LEVEL, VISIBLE_ROWS } from './types.js';
import type { ActivePiece, GameEvent, GameMode, GamePhase, Grid, LevelProgress, PieceKind, RotationState, Vec2 } from './types.js';

export type SpecialKind = 'bomb' | 'bolt' | 'wild' | 'drill';

export interface ChaosHooks {
  gravityMultiplier?: number;
  nextSpecial?: () => SpecialKind | null;
  beforeLock?: (cells: Vec2[]) => void;
  afterLock?: (info: { cells: Vec2[]; cleared: number[] }) => void;
}

export interface EngineOptions { rng?: () => number; onEvent?: (e: GameEvent) => void; mode?: GameMode; seed?: number; chaos?: ChaosHooks; }
const LOCK_DELAY = 0.5;
const MAX_LOCK_RESETS = 15;

/**
 * Curva logarítmica de gravedad: el intervalo cae como `1 - K·ln(nivel)`.
 * K se calibra para que el nivel 20 nuevo tenga la velocidad del antiguo
 * nivel 10 (~0.064 s), estirando la progresión en todo el rango 1–20.
 */
const LOG_GRAVITY_K = (1 - 0.06415158495985583) / Math.log(20);

export function gravityInterval(level: number): number {
  const l = Math.max(1, level);
  const t = 1 - LOG_GRAVITY_K * Math.log(l);
  return Math.min(1, Math.max(0.03, t));
}

export class TetrisEngine {
  grid: Grid = createGrid();
  active: ActivePiece | null = null;
  /** Comodin: monomino 1x1 (una sola celda en el origen). */
  activeSingle = false;
  queue: PieceKind[] = [];
  holdKind: PieceKind | null = null;
  canHold = true;
  phase: GamePhase = 'ready';
  score = 0; lines = 0; level = 1; combo = -1;
  /** Seconds of play accumulated inside the current level (drives the gauge). */
  levelTime = 0;
  softDrop = false;
  readonly mode: GameMode;
  readonly seed?: number;
  special: SpecialKind | null = null;
  chaos: ChaosHooks | null = null;
  /** Bump counter: changes whenever the grid changes (merge/clear/reset). Lets the view sync lazily. */
  gridVersion = 0;
  /** Bump counter: changes whenever the active piece moves, rotates or is replaced. */
  pieceVersion = 0;
  private fallAcc = 0; private lockAcc = 0; private lockResets = 0;
  private readonly rng: () => number;
  private readonly onEvent?: (e: GameEvent) => void;
  constructor(opts: EngineOptions = {}) { this.rng = opts.rng ?? Math.random; this.onEvent = opts.onEvent; this.mode = opts.mode ?? 'classic'; this.seed = opts.seed; this.chaos = opts.chaos ?? null; this.chaosRng = mulberry32(opts.seed ?? 0); }
  private emit(e: GameEvent): void { this.onEvent?.(e); }
  /** Starts a run, optionally from a higher difficulty level (clamped 1..MAX_LEVEL). */
  start(startLevel = 1): void {
    const firstLevel = Math.min(MAX_LEVEL, Math.max(1, Math.floor(startLevel)));
    this.grid = createGrid(); this.queue = [];
    this.holdKind = null; this.canHold = true;
    this.score = 0; this.lines = 0; this.level = firstLevel; this.combo = -1;
    this.levelTime = 0;
    this.fallAcc = 0; this.lockAcc = 0; this.lockResets = 0; this.softDrop = false;
    this.gridVersion++;
    this.refillQueue(); this.phase = 'playing'; this.spawn();
  }
  pause(): void { if (this.phase === 'playing') this.phase = 'paused'; }
  resume(): void { if (this.phase === 'paused') this.phase = 'playing'; }
  private refillQueue(): void { while (this.queue.length < 7) this.queue.push(...shuffledBag(this.rng)); }
  /** RNG con semilla para caos (misma semilla => misma partida); classic usa Math.random. */
  private readonly chaosRng: () => number;
  private nextSpecial(): SpecialKind | null {
    if (this.mode !== 'chaos') return null;
    if (this.chaos?.nextSpecial) return this.chaos.nextSpecial();
    if (this.seed !== undefined && this.chaosRng() < 0.07) {
      const kinds: SpecialKind[] = ['bomb', 'bolt', 'wild', 'drill'];
      return kinds[Math.floor(this.chaosRng() * kinds.length) ?? 0] ?? 'bomb';
    }
    return null;
  }
  private spawn(): void {
    this.refillQueue();
    const kind = this.queue.shift() as PieceKind;
    this.refillQueue();
    this.special = this.nextSpecial();
    this.activeSingle = this.special === 'wild';
    this.active = { kind, rotation: 0, x: Math.floor(COLS / 2) - 1, y: VISIBLE_ROWS - 1 };
    this.fallAcc = 0; this.lockAcc = 0; this.lockResets = 0;
    this.pieceVersion++;
    if (collides(this.grid, this.activeCells())) { this.phase = 'gameover'; this.emit({ type: 'gameover', scoreGained: this.score }); }
  }
  activeCells(): Vec2[] {
    if (!this.active) return [];
    if (this.activeSingle) return [{ x: this.active.x, y: this.active.y }];
    return cellsForPiece(this.active.kind, this.active.rotation, this.active.x, this.active.y);
  }
  ghostY(): number {
    if (!this.active) return 0;
    let y = this.active.y;
    while (!collides(this.grid, cellsForPiece(this.active.kind, this.active.rotation, this.active.x, y - 1))) y--;
    return y;
  }
  ghostCells(): Vec2[] {
    if (!this.active) return [];
    return cellsForPiece(this.active.kind, this.active.rotation, this.active.x, this.ghostY());
  }
  private touchingGround(): boolean {
    if (!this.active) return false;
    return collides(this.grid, cellsForPiece(this.active.kind, this.active.rotation, this.active.x, this.active.y - 1));
  }
  update(dt: number): void {
    if (this.phase !== 'playing' || !this.active) return;
    // Time pressure: a level also falls behind the player breaks at SECONDS_PER_LEVEL.
    this.levelTime += dt;
    if (this.level < MAX_LEVEL && this.levelTime >= SECONDS_PER_LEVEL) this.levelUp();
    const interval = this.softDrop ? Math.min(0.05, gravityInterval(this.level) / 20) : gravityInterval(this.level);
    if (this.touchingGround()) {
      this.lockAcc += dt;
      if (this.lockAcc >= LOCK_DELAY) this.lockPiece();
      return;
    }
    this.lockAcc = 0;
    this.fallAcc += dt;
    let guard = 0;
    while (this.fallAcc >= interval && guard++ < 40) {
      this.fallAcc -= interval;
      if (!this.stepDown(this.softDrop ? 1 : 0)) break;
      if (!this.active || this.phase !== 'playing') break;
      if (this.touchingGround()) break;
    }
  }
  /** Applies one level of extra difficulty (time- or lines-driven) and resets the level clock. */
  private levelUp(): void {
    if (this.level >= MAX_LEVEL) { this.levelTime = SECONDS_PER_LEVEL; return; }
    this.level += 1;
    this.levelTime = 0;
    this.emit({ type: 'levelup', level: this.level });
  }
  /** Gauge data: progress toward the next level, whichever rule (lines/time) is ahead. */
  levelProgress(): LevelProgress {
    if (this.level >= MAX_LEVEL) return { ratio: 1, source: 'lines', atMax: true };
    const into = this.lines - (this.level - 1) * LINES_PER_LEVEL;
    const lineRatio = Math.min(1, Math.max(0, into / LINES_PER_LEVEL));
    const timeRatio = Math.min(1, this.levelTime / SECONDS_PER_LEVEL);
    return lineRatio >= timeRatio
      ? { ratio: lineRatio, source: 'lines', atMax: false }
      : { ratio: timeRatio, source: 'time', atMax: false };
  }
  private stepDown(softPoints: number): boolean {
    if (!this.active) return false;
    const next = cellsForPiece(this.active.kind, this.active.rotation, this.active.x, this.active.y - 1);
    if (collides(this.grid, next)) return false;
    this.active.y -= 1;
    this.pieceVersion++;
    if (softPoints > 0) this.score += softPoints;
    return true;
  }
  move(dx: -1 | 1): boolean {
    if (this.phase !== 'playing' || !this.active) return false;
    const next = cellsForPiece(this.active.kind, this.active.rotation, this.active.x + dx, this.active.y);
    if (collides(this.grid, next)) return false;
    this.active.x += dx;
    this.pieceVersion++;
    this.emit({ type: 'move' });
    this.resetLockDelay();
    return true;
  }
  moveDown(): boolean {
    if (this.phase !== 'playing' || !this.active) return false;
    const ok = this.stepDown(1);
    if (ok) this.resetLockDelay(); else this.lockPiece();
    return ok;
  }
  rotate(dir: 1 | -1): boolean {
    if (this.phase !== 'playing' || !this.active) return false;
    const from = this.active.rotation;
    const to = (((from + dir) % 4) + 4) % 4 as RotationState;
    const kicks = getKicks(this.active.kind, from, to);
    for (const k of kicks) {
      const cells = cellsForPiece(this.active.kind, to, this.active.x + k.x, this.active.y + k.y);
      if (!collides(this.grid, cells)) {
        this.active.rotation = to; this.active.x += k.x; this.active.y += k.y;
        this.pieceVersion++;
        this.emit({ type: 'rotate' }); this.resetLockDelay(); return true;
      }
    }
    // Fallback: la SRS no cubre todas las pegadas al borde (p. ej. I vertical
    // contra el muro). Para que la pieza rote igual, buscamos el desplazamiento
    // mínimo que la deje en una posición válida, priorizando el empuje
    // horizontal hacia dentro del tablero.
    const tried = new Set(kicks.map((k) => `${k.x},${k.y}`));
    const candidates: Vec2[] = [];
    for (let dx = -4; dx <= 4; dx++) {
      for (let dy = -2; dy <= 3; dy++) {
        const key = `${dx},${dy}`;
        if (tried.has(key)) continue;
        candidates.push({ x: dx, y: dy });
      }
    }
    candidates.sort((a, b) =>
      (Math.abs(a.x) + Math.abs(a.y)) - (Math.abs(b.x) + Math.abs(b.y)) ||
      Math.abs(a.x) - Math.abs(b.x) ||
      Math.abs(b.y) - Math.abs(a.y),
    );
    for (const k of candidates) {
      const cells = cellsForPiece(this.active.kind, to, this.active.x + k.x, this.active.y + k.y);
      if (!collides(this.grid, cells)) {
        this.active.rotation = to; this.active.x += k.x; this.active.y += k.y;
        this.pieceVersion++;
        this.emit({ type: 'rotate' }); this.resetLockDelay(); return true;
      }
    }
    return false;
  }
  private resetLockDelay(): void {
    if (this.touchingGround() && this.lockResets < MAX_LOCK_RESETS) { this.lockAcc = 0; this.lockResets++; }
  }
  hardDrop(): void {
    if (this.phase !== 'playing' || !this.active) return;
    const landingY = this.ghostY();
    const distance = this.active.y - landingY;
    this.active.y = landingY;
    this.pieceVersion++;
    this.score += distance * 2;
    this.emit({ type: 'harddrop', cells: this.activeCells() });
    this.lockPiece();
  }
  hold(): void {
    if (this.phase !== 'playing' || !this.active || !this.canHold) return;
    const cur = this.active.kind;
    if (this.holdKind === null) { this.holdKind = cur; this.spawn(); }
    else {
      const tmp = this.holdKind; this.holdKind = cur;
      this.activeSingle = false; this.special = null;
      this.active = { kind: tmp, rotation: 0, x: Math.floor(COLS / 2) - 1, y: VISIBLE_ROWS - 1 };
      this.fallAcc = 0; this.lockAcc = 0; this.lockResets = 0;
      this.pieceVersion++;
      if (collides(this.grid, this.activeCells())) { this.phase = 'gameover'; this.emit({ type: 'gameover', scoreGained: this.score }); }
    }
    // A swap that ended the game must not consume the hold slot nor report a hold.
    if (this.phase !== 'playing') return;
    this.canHold = false;
    this.emit({ type: 'hold' });
  }
  peekNext(count = 5): PieceKind[] { return this.queue.slice(0, count); }
  result(): { score: number; level: number; lines: number; mode: GameMode; seed?: number } {
    return { score: this.score, level: this.level, lines: this.lines, mode: this.mode, seed: this.seed };
  }
  /** Bomba: borra un area 3x3 alrededor del centro de impacto (clamp al tablero). */
  private applyBomb(cells: Vec2[]): void {
    if (cells.length === 0) return;
    let sx = 0; let sy = 0;
    for (const c of cells) { sx += c.x; sy += c.y; }
    const cx = Math.round(sx / cells.length); const cy = Math.round(sy / cells.length);
    for (let y = cy - 1; y <= cy + 1; y++) {
      const row = this.grid[y];
      if (!row) continue;
      for (let x = cx - 1; x <= cx + 1; x++) {
        if (x < 0 || x >= COLS) continue;
        row[x] = 0;
      }
    }
  }
  /** Rayo: borra la fila donde aterriza (la fila minima de las celdas fijadas). */
  private applyBolt(cells: Vec2[]): void {
    let minY = Number.POSITIVE_INFINITY;
    for (const c of cells) minY = Math.min(minY, c.y);
    if (!Number.isFinite(minY)) return;
    const row = this.grid[minY];
    if (!row) return;
    for (let x = 0; x < COLS; x++) row[x] = 0;
  }
  /** Taladro: intenta bajar la pieza una celda destruyendo 1 bloque; true si perforo. */
  drillStep(): boolean {
    if (this.phase !== 'playing' || !this.active || this.special !== 'drill') return false;
    const below = this.activeSingle
      ? [{ x: this.active.x, y: this.active.y - 1 }]
      : cellsForPiece(this.active.kind, this.active.rotation, this.active.x, this.active.y - 1);
    let blocker: Vec2 | null = null;
    for (const c of below) {
      if (c.y < 0 || c.x < 0 || c.x >= COLS) return false;
      const row = this.grid[c.y];
      if (row && row[c.x] !== 0) {
        if (blocker) return false; // solo atraviesa 1 celda por pieza
        blocker = c;
      }
    }
    if (!blocker) return false;
    const row = this.grid[blocker.y];
    if (!row) return false;
    row[blocker.x] = 0;
    this.active.y -= 1;
    this.special = null; // perforacion consumida
    this.gridVersion++; this.pieceVersion++;
    this.emit({ type: 'lock', cells: [blocker] });
    return true;
  }
  /** Basura: sube `rows` filas con hueco aleatorio; gameover si desborda la zona oculta. */
  pushGarbage(count: number, holeAt: (row: number) => number): void {
    for (let i = 0; i < count; i++) {
      const hole = holeAt(i);
      const garbage = new Array(COLS).fill('Z') as Grid[number];
      garbage[Math.max(0, Math.min(COLS - 1, hole))] = 0;
      this.grid.shift();
      this.grid.push(garbage as never);
    }
    if (this.active && collides(this.grid, this.activeCells())) {
      this.phase = 'gameover'; this.emit({ type: 'gameover', scoreGained: this.score });
    }
    this.gridVersion++;
  }
  /** Temblor: desplaza la fila `row` un paso lateral con wrap. */
  shiftRow(row: number, dir: 1 | -1): void {
    const r = this.grid[row];
    if (!r) return;
    if (dir === 1) { const last = r.pop() as (typeof r)[number]; r.unshift(last); }
    else { const first = r.shift() as (typeof r)[number]; r.push(first); }
    this.gridVersion++;
  }
  /** Cascada: compacta cada columna hacia abajo; devuelve si hubo movimiento. */
  settleColumns(): boolean {
    let moved = false;
    for (let x = 0; x < COLS; x++) {
      let write = 0;
      for (let y = 0; y < this.grid.length; y++) {
        const row = this.grid[y];
        if (!row) continue;
        const v = row[x];
        if (v !== 0 && v !== undefined) {
          if (y !== write) {
            const target = this.grid[write];
            if (target) { target[x] = v; row[x] = 0; moved = true; }
          }
          write++;
        }
      }
    }
    if (moved) this.gridVersion++;
    return moved;
  }
  private lockPiece(): void {
    if (!this.active) return;
    const cells = this.activeCells();
    const special = this.special;
    this.chaos?.beforeLock?.(cells);
    mergePiece(this.grid, cells, this.active.kind);
    if (special === 'bomb') this.applyBomb(cells);
    if (special === 'bolt') this.applyBolt(cells);
    this.gridVersion++;
    this.emit({ type: 'lock', cells });
    let cleared: number[] = clearFullRows(this.grid);
    if (cleared.length > 0) {
      const n = Math.min(4, cleared.length);
      const base = LINE_POINTS[n as 1 | 2 | 3 | 4] ?? 0;
      this.combo += 1;
      const comboBonus = this.combo > 0 ? 50 * this.combo * this.level : 0;
      const gained = base * this.level + comboBonus;
      this.score += gained;
      this.lines += cleared.length;
      const newLevel = Math.min(MAX_LEVEL, Math.floor(this.lines / LINES_PER_LEVEL) + 1);
      this.emit({ type: 'clear', lines: cleared.length, rows: cleared, cells, scoreGained: gained, level: newLevel });
      if (newLevel > this.level) { this.level = newLevel; this.levelTime = 0; this.emit({ type: 'levelup', level: newLevel }); }
      if (this.combo > 0) this.emit({ type: 'combo', scoreGained: this.combo });
    } else { this.combo = -1; }
    this.chaos?.afterLock?.({ cells, cleared });
    this.special = null; this.activeSingle = false;
    this.canHold = true;
    if (this.phase === 'playing') this.spawn();
  }
}
