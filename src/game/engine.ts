import { clearFullRows, collides, createGrid, mergePiece } from './board.js';
import { mulberry32 } from './rng.js';
import { cellsForPiece, getKicks, shuffledBag } from './pieces.js';
import { MutatorDirector } from './mutators/director.js';
import type { MutatorConfig } from './mutators/config.js';
import type { MutatorEvent, MutatorHost, WindDir } from './mutators/types.js';
import { BOLT_BREAKS, COLS, DRILL_DEPTH, LINES_PER_LEVEL, LINE_POINTS, MAX_LEVEL, SECONDS_PER_LEVEL, SPECIAL_PROBABILITY, TOTAL_ROWS, VISIBLE_ROWS } from './types.js';
import type { ActivePiece, GameEvent, GameMode, GamePhase, Grid, LevelProgress, PieceKind, RotationState, Vec2 } from './types.js';

export type SpecialKind = 'bomb' | 'bolt' | 'drill';

export interface EngineOptions {
  rng?: () => number;
  onEvent?: (e: GameEvent) => void;
  mode?: GameMode;
  seed?: number;
  /** Eventos del ciclo de tormentas (solo modo Caos). */
  onMutatorEvent?: (e: MutatorEvent) => void;
  /** Ajustes de tormentas; los tests aíslan un mutador con `pool`. */
  mutatorConfig?: Partial<MutatorConfig>;
}
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

export class TetrisEngine implements MutatorHost {
  grid: Grid = createGrid();
  active: ActivePiece | null = null;
  queue: PieceKind[] = [];
  holdKind: PieceKind | null = null;
  holdSpecial: SpecialKind | null = null;
  canHold = true;
  phase: GamePhase = 'ready';
  score = 0; lines = 0; level = 1; combo = -1;
  /** Seconds of play accumulated inside the current level (drives the gauge). */
  levelTime = 0;
  softDrop = false;
  readonly mode: GameMode;
  readonly seed?: number;
  special: SpecialKind | null = null;
  /** Lluvia activa: cada movimiento lateral desliza una celda extra. */
  slippery = false;
  /** Ciclo de tormentas del modo Caos (inactivo en Tradicional). */
  readonly mutators: MutatorDirector;
  /** Especial ya decidido para la proxima pieza: el preview lo anuncia. */
  private pendingSpecial: SpecialKind | null = null;
  /** El taladro se hunde una sola vez por pieza (viaja con ella en el HOLD). */
  private drillUsed = false;
  private holdDrillUsed = false;
  /** Columns that currently host hail (garbage) tiles. Read by the renderer for tinting. */
  hailColumns: number[] = [];
  /** Bump counter: changes whenever the grid changes (merge/clear/reset). Lets the view sync lazily. */
  gridVersion = 0;
  /** Bump counter: changes whenever the active piece moves, rotates or is replaced. */
  pieceVersion = 0;
  private fallAcc = 0; private lockAcc = 0; private lockResets = 0;
  private readonly rng: () => number;
  private readonly onEvent?: (e: GameEvent) => void;
  constructor(opts: EngineOptions = {}) {
    this.rng = opts.rng ?? Math.random;
    this.onEvent = opts.onEvent;
    this.mode = opts.mode ?? 'classic';
    this.seed = opts.seed;
    this.chaosRng = mulberry32(opts.seed ?? 0);
    this.mutators = new MutatorDirector({
      seed: opts.seed ?? 0,
      enabled: this.mode === 'chaos',
      host: this,
      config: opts.mutatorConfig,
      onEvent: opts.onMutatorEvent
    });
  }
  private emit(e: GameEvent): void { this.onEvent?.(e); }
  /** Starts a run, optionally from a higher difficulty level (clamped 1..MAX_LEVEL). */
  start(startLevel = 1): void {
    const firstLevel = Math.min(MAX_LEVEL, Math.max(1, Math.floor(startLevel)));
    this.grid = createGrid(); this.queue = [];
    this.holdKind = null; this.holdSpecial = null; this.holdDrillUsed = false; this.canHold = true;
    this.score = 0; this.lines = 0; this.level = firstLevel; this.combo = -1;
    this.levelTime = 0;
    this.fallAcc = 0; this.lockAcc = 0; this.lockResets = 0; this.softDrop = false;
    this.slippery = false;
    this.gridVersion++;
    this.pendingSpecial = this.rollSpecial();
    this.mutators.reset();
    this.refillQueue(); this.phase = 'playing'; this.spawn();
  }
  pause(): void { if (this.phase === 'playing') this.phase = 'paused'; }
  resume(): void { if (this.phase === 'paused') this.phase = 'playing'; }
  private refillQueue(): void { while (this.queue.length < 7) this.queue.push(...shuffledBag(this.rng)); }
  /** RNG con semilla para caos (misma semilla => misma partida); classic usa Math.random. */
  private readonly chaosRng: () => number;
  /** Lanza el dado para una futura pieza: con SPECIAL_PROBABILITY nace especial. */
  private rollSpecial(): SpecialKind | null {
    if (this.mode !== 'chaos') return null;
    if (this.chaosRng() >= SPECIAL_PROBABILITY) return null;
    const kinds: SpecialKind[] = ['bomb', 'bolt', 'drill'];
    return kinds[Math.floor(this.chaosRng() * kinds.length) ?? 0] ?? 'bomb';
  }
  /** Consume el especial pendiente (pieza actual) y decide el del proximo spawn. */
  private nextSpecial(): SpecialKind | null {
    const got = this.pendingSpecial;
    this.pendingSpecial = this.rollSpecial();
    return got;
  }
  /** Especial de la proxima pieza (para el badge del preview). */
  peekSpecial(): SpecialKind | null { return this.pendingSpecial; }
  private spawn(): void {
    this.refillQueue();
    const kind = this.queue.shift() as PieceKind;
    this.refillQueue();
    this.special = this.nextSpecial();
    this.active = { kind, rotation: 0, x: Math.floor(COLS / 2) - 1, y: VISIBLE_ROWS - 1 };
    this.fallAcc = 0; this.lockAcc = 0; this.lockResets = 0; this.drillUsed = false;
    this.pieceVersion++;
    if (collides(this.grid, this.activeCells())) { this.phase = 'gameover'; this.emit({ type: 'gameover', scoreGained: this.score }); }
  }
  activeCells(): Vec2[] {
    if (!this.active) return [];
    return this.cellsAt(this.active.x, this.active.y);
  }
  cellsAt(x: number, y: number): Vec2[] {
    if (!this.active) return [];
    return cellsForPiece(this.active.kind, this.active.rotation, x, y);
  }
  ghostY(): number {
    if (!this.active) return 0;
    let y = this.active.y;
    while (!collides(this.grid, this.cellsAt(this.active.x, y - 1))) y--;
    return y;
  }
  ghostCells(): Vec2[] {
    if (!this.active) return [];
    return this.cellsAt(this.active.x, this.ghostY());
  }
  private touchingGround(): boolean {
    if (!this.active) return false;
    return collides(this.grid, this.cellsAt(this.active.x, this.active.y - 1));
  }
  update(dt: number): void {
    if (this.phase !== 'playing' || !this.active) return;
    // Tormentas del Caos: avisos, viento y lluvia avanzan con el reloj del juego.
    this.mutators.update(dt);
    if (this.phase !== 'playing' || !this.active) return;
    // Time pressure: a level also falls behind the player breaks at SECONDS_PER_LEVEL.
    this.levelTime += dt;
    if (this.level < MAX_LEVEL && this.levelTime >= SECONDS_PER_LEVEL) this.levelUp();
    const interval = this.softDrop ? Math.min(0.05, gravityInterval(this.level) / 20) : gravityInterval(this.level);
    if (this.touchingGround()) {
      // Taladro: al tocar el monton se hunde de golpe antes de fijarse.
      if (this.drillSink()) return;
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
    const next = this.cellsAt(this.active.x, this.active.y - 1);
    if (collides(this.grid, next)) return false;
    this.active.y -= 1;
    this.pieceVersion++;
    if (softPoints > 0) this.score += softPoints;
    return true;
  }
  move(dx: -1 | 1): boolean {
    if (this.phase !== 'playing' || !this.active) return false;
    if (!this.shiftLateral(dx)) return false;
    // Lluvia: si la celda extra está libre, la pieza se desliza una más. Es
    // parte de la misma acción (un solo reset de lock delay, un solo evento).
    if (this.slippery) this.shiftLateral(dx);
    this.pieceVersion++;
    this.emit({ type: 'move' });
    this.resetLockDelay();
    return true;
  }
  /** Desplaza la pieza una celda si cabe. No emite eventos ni reinicia el lock. */
  private shiftLateral(dx: -1 | 1): boolean {
    if (!this.active) return false;
    const next = this.cellsAt(this.active.x + dx, this.active.y);
    if (collides(this.grid, next)) return false;
    this.active.x += dx;
    return true;
  }
  /** Empuje del viento: una celda, sin el deslizamiento extra de la lluvia. */
  pushWind(dir: WindDir): boolean {
    if (this.phase !== 'playing' || !this.active) return false;
    if (!this.shiftLateral(dir)) return false;
    this.pieceVersion++;
    this.resetLockDelay();
    return true;
  }
  /** La lluvia activa/desactiva el suelo resbaladizo (lo llama el director). */
  setSlippery(on: boolean): void { this.slippery = on; }
  moveDown(): boolean {
    if (this.phase !== 'playing' || !this.active) return false;
    const ok = this.stepDown(1);
    if (ok) { this.resetLockDelay(); return true; }
    if (this.drillSink()) return true;
    this.lockPiece();
    return false;
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
    this.drillSink(); // el taladro tambien se hunde en la caida instantanea
    this.lockPiece();
  }
  hold(): void {
    if (this.phase !== 'playing' || !this.active || !this.canHold) return;
    const cur = this.active.kind;
    const curSpecial = this.special;
    const curUsed = this.drillUsed;
    if (this.holdKind === null) { this.holdKind = cur; this.holdSpecial = curSpecial; this.holdDrillUsed = curUsed; this.spawn(); }
    else {
      const tmp = this.holdKind; const tmpSpecial = this.holdSpecial; const tmpUsed = this.holdDrillUsed;
      this.holdKind = cur; this.holdSpecial = curSpecial; this.holdDrillUsed = curUsed;
      // El especial viaja con la pieza que sale del hueco (con su estado de taladro).
      this.special = tmpSpecial;
      this.drillUsed = tmpUsed;
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
  /** Bomba: revienta las 2 filas del impacto (la de aterrizaje y la contigua hacia
   *  el monton); lo que quedaba encima cae. El objeto se consume en la explosion. */
  private applyBomb(cells: Vec2[]): void {
    if (cells.length === 0) return;
    let minY = Number.POSITIVE_INFINITY;
    for (const c of cells) minY = Math.min(minY, c.y);
    if (!Number.isFinite(minY)) return;
    const rowA = Math.max(0, Math.min(TOTAL_ROWS - 1, minY));
    const rowB = rowA > 0 ? rowA - 1 : Math.min(TOTAL_ROWS - 1, rowA + 1);
    const blast: Vec2[] = [];
    for (const y of [rowA, rowB]) {
      const row = this.grid[y];
      if (!row) continue;
      for (let x = 0; x < COLS; x++) {
        if (row[x] !== 0) blast.push({ x, y });
        row[x] = 0;
      }
    }
    if (blast.length === 0) return;
    this.settleColumns();
    this.gridVersion++;
    this.emit({ type: 'bomb', rows: [rowA, rowB], cells: blast });
  }
  /** Rayo: rompe los BOLT_BREAKS bloques mas altos bajo la base de la pieza. */
  private applyBolt(cells: Vec2[]): void {
    if (cells.length === 0) return;
    const baseY = new Map<number, number>();
    for (const c of cells) {
      const cur = baseY.get(c.x);
      if (cur === undefined || c.y < cur) baseY.set(c.x, c.y);
    }
    const under: Vec2[] = [];
    for (const [x, base] of baseY) {
      for (let y = base - 1; y >= 0; y--) {
        const row = this.grid[y];
        if (row && row[x] !== 0) under.push({ x, y });
      }
    }
    under.sort((a, b) => b.y - a.y || a.x - b.x);
    const broken = under.slice(0, BOLT_BREAKS);
    if (broken.length === 0) return;
    for (const c of broken) {
      const row = this.grid[c.y];
      if (row) row[c.x] = 0;
    }
    this.settleColumns();
    this.gridVersion++;
    this.emit({ type: 'bolt', rows: [...new Set(broken.map((c) => c.y))], cells: broken });
  }
  /** Taladro: se hunde DRILL_DEPTH filas destruyendo los bloques bajo su base;
   *  una sola vez por pieza. Devuelve si llego a hundirse. */
  drillSink(): boolean {
    if (this.phase !== 'playing' || !this.active || this.special !== 'drill' || this.drillUsed) return false;
    const cells = this.activeCells();
    if (cells.length === 0) return false;
    let minY = Number.POSITIVE_INFINITY;
    for (const c of cells) minY = Math.min(minY, c.y);
    if (!Number.isFinite(minY) || minY <= 0) return false; // en el suelo no hay nada bajo la base
    let sink = Math.min(DRILL_DEPTH, minY);
    const baseY = new Map<number, number>();
    for (const c of cells) {
      const cur = baseY.get(c.x);
      if (cur === undefined || c.y < cur) baseY.set(c.x, c.y);
    }
    const bored: Vec2[] = [];
    for (const [x, base] of baseY) {
      for (let y = base - 1; y >= base - sink; y--) {
        const row = this.grid[y];
        if (row && row[x] !== 0) { row[x] = 0; bored.push({ x, y }); }
      }
    }
    while (sink > 0 && collides(this.grid, this.cellsAt(this.active.x, this.active.y - sink))) sink--;
    if (sink <= 0) return false;
    this.active.y -= sink;
    this.drillUsed = true;
    this.gridVersion++; this.pieceVersion++;
    this.emit({ type: 'drill', cells: bored });
    return true;
  }
  /** Compacta cada columna hacia abajo (tras bomba/rayo); devuelve si hubo movimiento. */
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
    if (special) {
      // Los powerups NO son piezas de construccion: aplican su efecto sobre las
      // piezas/bloques y el objeto se consume, sin dejar rastro en la grilla.
      // (El taladro ya aplico su efecto al hundirse: drillSink).
      if (special === 'bomb') this.applyBomb(cells);
      else if (special === 'bolt') this.applyBolt(cells);
    } else {
      mergePiece(this.grid, cells, this.active.kind);
      this.gridVersion++;
      this.emit({ type: 'lock', cells });
      const cleared: number[] = clearFullRows(this.grid);
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
    }
    this.special = null;
    this.canHold = true;
    if (this.phase === 'playing') this.spawn();
  }

  /** Relámpago: corta las celdas objetivo, compacta columnas y notifica. */
  lightningStrike(cells: Vec2[]): void {
    for (const c of cells) {
      const row = this.grid[c.y];
      if (row) row[c.x] = 0;
    }
    this.settleColumns();
    this.gridVersion++;
    this.emit({ type: 'lightning', cells });
  }

  /** Columnas que tienen al menos un bloque (incluido granizo). */
  occupiedColumns(): number[] {
    const out: number[] = [];
    for (let x = 0; x < COLS; x++) {
      let occ = false;
      for (let y = 0; y < TOTAL_ROWS; y++) {
        const v = this.grid[y]?.[x];
        if (v !== 0 && v !== undefined) { occ = true; break; }
      }
      if (occ) out.push(x);
    }
    return out;
  }

  /** Fila más alta ocupada en la columna (o -1 si vacía). */
  topCell(col: number): number {
    for (let y = TOTAL_ROWS - 1; y >= 0; y--) {
      const v = this.grid[y]?.[col];
      if (v !== 0 && v !== undefined) return y;
    }
    return -1;
  }

  /** Gránido: deja celdas basura ('G') en las columnas objetivo (sobre el montículo). */
  dropHail(columns: number[]): void {
    for (const x of columns) {
      let top = -1;
      for (let y = 0; y < TOTAL_ROWS; y++) if (this.grid[y]?.[x] !== 0 && this.grid[y]?.[x] !== undefined) top = y;
      const land = top + 1;
      if (land >= 0 && land < TOTAL_ROWS) {
        const row = this.grid[land];
        if (row) row[x] = 'G';
      }
      if (!this.hailColumns.includes(x)) this.hailColumns.push(x);
    }
    this.gridVersion++;
    this.emit({ type: 'hail', columns });
  }

  /** Elimina todas las celdas de granizo ('G') del tablero. */
  meltHail(): void {
    for (let y = 0; y < TOTAL_ROWS; y++) {
      const row = this.grid[y];
      if (!row) continue;
      for (let x = 0; x < COLS; x++) if (row[x] === 'G') row[x] = 0;
    }
    this.hailColumns = [];
    this.gridVersion++;
  }

}
