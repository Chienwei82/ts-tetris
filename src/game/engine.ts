import { clearFullRows, collides, createGrid, mergePiece } from './board.js';
import { cellsForPiece, getKicks, shuffledBag } from './pieces.js';
import { COLS, LINES_PER_LEVEL, LINE_POINTS, MAX_LEVEL, SECONDS_PER_LEVEL, TOTAL_ROWS, VISIBLE_ROWS } from './types.js';
import type { ActivePiece, GameEvent, GamePhase, Grid, LevelProgress, PieceKind, RotationState, Vec2 } from './types.js';

export interface EngineOptions { rng?: () => number; onEvent?: (e: GameEvent) => void; }
const LOCK_DELAY = 0.5;
const MAX_LOCK_RESETS = 15;

export function gravityInterval(level: number): number {
  const l = Math.max(1, level);
  const t = Math.pow(0.8 - (l - 1) * 0.007, l - 1);
  return Math.min(1, Math.max(0.03, t));
}

export class TetrisEngine {
  grid: Grid = createGrid();
  active: ActivePiece | null = null;
  queue: PieceKind[] = [];
  holdKind: PieceKind | null = null;
  canHold = true;
  phase: GamePhase = 'ready';
  score = 0; lines = 0; level = 1; combo = -1;
  /** Seconds of play accumulated inside the current level (drives the gauge). */
  levelTime = 0;
  softDrop = false;
  private fallAcc = 0; private lockAcc = 0; private lockResets = 0;
  private readonly rng: () => number;
  private readonly onEvent?: (e: GameEvent) => void;
  constructor(opts: EngineOptions = {}) { this.rng = opts.rng ?? Math.random; this.onEvent = opts.onEvent; }
  private emit(e: GameEvent): void { this.onEvent?.(e); }
  /** Starts a run, optionally from a higher difficulty level (clamped 1..MAX_LEVEL). */
  start(startLevel = 1): void {
    const firstLevel = Math.min(MAX_LEVEL, Math.max(1, Math.floor(startLevel)));
    this.grid = createGrid(); this.queue = [];
    this.holdKind = null; this.canHold = true;
    this.score = 0; this.lines = 0; this.level = firstLevel; this.combo = -1;
    this.levelTime = 0;
    this.fallAcc = 0; this.lockAcc = 0; this.lockResets = 0; this.softDrop = false;
    this.refillQueue(); this.phase = 'playing'; this.spawn();
  }
  pause(): void { if (this.phase === 'playing') this.phase = 'paused'; }
  resume(): void { if (this.phase === 'paused') this.phase = 'playing'; }
  private refillQueue(): void { while (this.queue.length < 7) this.queue.push(...shuffledBag(this.rng)); }
  private spawn(): void {
    this.refillQueue();
    const kind = this.queue.shift() as PieceKind;
    this.refillQueue();
    this.active = { kind, rotation: 0, x: Math.floor(COLS / 2) - 1, y: VISIBLE_ROWS - 1 };
    this.fallAcc = 0; this.lockAcc = 0; this.lockResets = 0;
    if (collides(this.grid, this.activeCells())) { this.phase = 'gameover'; this.emit({ type: 'gameover', scoreGained: this.score }); }
  }
  activeCells(): Vec2[] {
    if (!this.active) return [];
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
    if (softPoints > 0) this.score += softPoints;
    return true;
  }
  move(dx: -1 | 1): boolean {
    if (this.phase !== 'playing' || !this.active) return false;
    const next = cellsForPiece(this.active.kind, this.active.rotation, this.active.x + dx, this.active.y);
    if (collides(this.grid, next)) return false;
    this.active.x += dx;
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
    const distance = this.active.y - this.ghostY();
    this.active.y = this.ghostY();
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
      this.active = { kind: tmp, rotation: 0, x: Math.floor(COLS / 2) - 1, y: VISIBLE_ROWS - 1 };
      this.fallAcc = 0; this.lockAcc = 0; this.lockResets = 0;
      if (collides(this.grid, this.activeCells())) { this.phase = 'gameover'; this.emit({ type: 'gameover', scoreGained: this.score }); }
    }
    this.canHold = false;
    this.emit({ type: 'hold' });
  }
  peekNext(count = 5): PieceKind[] { return this.queue.slice(0, count); }
  private lockPiece(): void {
    if (!this.active) return;
    const cells = this.activeCells();
    mergePiece(this.grid, cells, this.active.kind);
    this.emit({ type: 'lock', cells: cells.filter((c) => c.y < TOTAL_ROWS) });
    const cleared = clearFullRows(this.grid);
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
    this.canHold = true;
    if (this.phase === 'playing') this.spawn();
  }
}
