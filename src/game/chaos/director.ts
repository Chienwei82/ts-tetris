import type { TetrisEngine } from '../engine.js';
import type { SpecialKind } from '../engine.js';
import { clearFullRows } from '../board.js';
import { COLS, TOTAL_ROWS } from '../types.js';
import { DEFAULT_CHAOS_CONFIG } from './config.js';
import type { ChaosConfig } from './config.js';
import { mulberry32 } from './rng.js';
import { listChaosModules } from './registry.js';
import type { ChaosContext, ChaosEvent, ChaosFlags, ChaosModule } from './types.js';
import { createChaosFlags } from './types.js';

export interface ChaosDirectorOptions {
  seed: number;
  config?: Partial<ChaosConfig>;
  onEvent?: (e: ChaosEvent) => void;
}

interface ActiveEntry { module: ChaosModule; remaining: number; }
interface WarnEntry { module: ChaosModule; warnLeft: number; duration: number; }
interface TimedWarn { id: string; name: string; left: number; detail?: string; fire: () => void; }

/** Orquesta mutadores y eventos: aviso previo -> activo + countdown, uno a la vez. */
export class ChaosDirector {
  readonly seed: number;
  readonly config: ChaosConfig;
  readonly flags: ChaosFlags = createChaosFlags();
  private readonly rng: () => number;
  private readonly emitFn?: (e: ChaosEvent) => void;
  private ctx: ChaosContext;
  private engineRef: TetrisEngine | null = null;
  private linesAtLastMutator = 0;
  private warn: WarnEntry | null = null;
  private active: ActiveEntry | null = null;
  private timed: TimedWarn[] = [];
  private garbageAcc = 0;
  private tremorAcc = 0;
  private specialQueue: SpecialKind[] = [];

  constructor(opts: ChaosDirectorOptions) {
    this.seed = opts.seed >>> 0;
    this.config = { ...DEFAULT_CHAOS_CONFIG, ...(opts.config ?? {}) };
    this.rng = mulberry32(this.seed);
    this.emitFn = opts.onEvent;
    this.ctx = { engine: null as unknown as TetrisEngine, config: this.config, rng: this.rng, emit: (e) => this.emit(e), flags: this.flags };
  }

  attach(engine: TetrisEngine): void {
    this.engineRef = engine;
    this.ctx.engine = engine;
    engine.chaos = {
      gravityMultiplier: 1,
      nextSpecial: () => this.consumeSpecial(),
      beforeLock: (cells) => this.beforeLock(cells),
      afterLock: (info) => this.afterLock(info.cells, info.cleared),
    };
    this.linesAtLastMutator = engine.lines;
  }

  private emit(e: ChaosEvent): void { this.emitFn?.(e); }

  /** Decide si el proximo spawn es especial (5-10% configurable). */
  private rollSpecial(): void {
    if (this.rng() < this.config.specialProbability) {
      const kinds: SpecialKind[] = ['bomb', 'bolt', 'wild', 'drill'];
      const pick = kinds[Math.floor(this.rng() * kinds.length) ?? 0] ?? 'bomb';
      this.specialQueue.push(pick);
      this.emit({ kind: 'warn', moduleId: 'special-' + pick, name: 'Pieza ' + pick, detail: 'special-incoming' });
    }
  }

  private consumeSpecial(): SpecialKind | null {
    this.rollSpecial();
    return this.specialQueue.shift() ?? null;
  }

  beforeLock(cells: { x: number; y: number }[]): void {
    const engine = this.engineRef;
    // Taladro: si la celda de abajo esta ocupada, perfora 1 bloque y sigue cayendo.
    if (engine && engine.special === 'drill' && engine.active) {
      const below = cells.map((c) => ({ x: c.x, y: c.y - 1 }));
      let blocker: { x: number; y: number } | null = null;
      for (const c of below) {
        if (c.y < 0 || c.x < 0 || c.x >= COLS) return;
        const row = engine.grid[c.y];
        if (row && row[c.x] !== 0) {
          if (blocker) return;
          blocker = c;
        }
      }
      if (blocker) {
        const row = engine.grid[blocker.y];
        if (row) row[blocker.x] = 0;
        engine.gridVersion++;
        this.emit({ kind: 'apply', moduleId: 'special-drill', name: 'Taladro', detail: `perfora (${blocker.x},${blocker.y})` });
        engine.special = null;
      }
    }
  }

  afterLock(_cells: { x: number; y: number }[], cleared: number[]): void {
    // Cascada: tras eliminar lineas, las celdas caen por columna y pueden dar combos.
    const engine = this.engineRef;
    if (!engine || cleared.length === 0) return;
    let guard = TOTAL_ROWS;
    let chained = 0;
    while (guard-- > 0) {
      const moved = engine.settleColumns();
      if (!moved) break;
      const extra = clearFullRows(engine.grid);
      if (extra.length === 0) break;
      chained++;
      engine.lines += extra.length;
      engine.combo += 1;
      const gained = 50 * extra.length * engine.level + 50 * engine.combo * engine.level;
      engine.score += gained;
      engine.gridVersion++;
      this.emit({ kind: 'apply', moduleId: 'cascade', name: 'Cascada', detail: `combo x${chained}: +${extra.length} lineas` });
    }
  }

  update(dt: number): void {
    const engine = this.engineRef;
    if (!engine || engine.phase !== 'playing') return;
    // --- Mutadores: cada N lineas, aviso 1s -> activo con countdown ---
    if (this.warn) {
      this.warn.warnLeft -= dt;
      if (this.warn.warnLeft <= 0) {
        const entry = this.warn;
        this.warn = null;
        this.startModule(entry.module, entry.duration);
      }
    } else if (this.active) {
      this.active.remaining -= dt;
      this.active.module.onTick(this.ctx, dt);
      if (this.active.remaining <= 0) this.endActive();
      else this.emit({ kind: 'tick', moduleId: this.active.module.id, name: this.active.module.name, remainingSec: this.active.remaining });
    } else if (engine.lines - this.linesAtLastMutator >= this.config.linesPerMutator) {
      this.linesAtLastMutator = engine.lines;
      const pool = listChaosModules().filter((m) => m.id.startsWith('mut-'));
      if (pool.length > 0) {
        const pick = pool[Math.floor(this.rng() * pool.length) ?? 0] ?? pool[0];
        if (pick) {
          const dur = this.config.mutatorMinSec + this.rng() * (this.config.mutatorMaxSec - this.config.mutatorMinSec);
          this.warn = { module: pick, warnLeft: this.config.mutatorWarnSec, duration: dur };
          this.emit({ kind: 'warn', moduleId: pick.id, name: pick.name, remainingSec: this.config.mutatorWarnSec });
        }
      }
    }
    // --- Basura y temblor con aviso (pausados mientras hay aviso/activo) ---
    const chaosBusy = this.warn !== null || this.active !== null || this.timed.length > 0;
    this.garbageAcc += dt;
    this.tremorAcc += dt;
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const tw = this.timed[i];
      if (!tw) continue;
      tw.left -= dt;
      if (tw.left <= 0) { this.timed.splice(i, 1); tw.fire(); }
      else this.emit({ kind: 'tick', moduleId: tw.id, name: tw.name, remainingSec: tw.left });
    }
    if (!chaosBusy && this.garbageAcc >= this.config.garbageIntervalSec) {
      this.garbageAcc = 0;
      const hole = Math.floor(this.rng() * COLS);
      this.emit({ kind: 'warn', moduleId: 'ev-garbage', name: 'Fila basura', detail: `hueco en columna ${hole + 1}`, remainingSec: this.config.garbageWarnSec });
      this.timed.push({
        id: 'ev-garbage', name: 'Fila basura', left: this.config.garbageWarnSec,
        detail: `hueco en columna ${hole + 1}`,
        fire: () => {
          engine.pushGarbage(1, () => hole);
          this.emit({ kind: 'apply', moduleId: 'ev-garbage', name: 'Fila basura', detail: `hueco en columna ${hole + 1}` });
        }
      });
    }
    if (!chaosBusy && this.tremorAcc >= this.config.tremorIntervalSec) {
      this.tremorAcc = 0;
      const row = Math.floor(this.rng() * 12);
      const dir = this.rng() < 0.5 ? 1 : -1;
      const arrow = dir === 1 ? '->' : '<-';
      this.emit({ kind: 'warn', moduleId: 'ev-tremor', name: 'Temblor', detail: `fila ${row + 1} ${arrow}`, remainingSec: this.config.tremorWarnSec });
      this.timed.push({
        id: 'ev-tremor', name: 'Temblor', left: this.config.tremorWarnSec,
        detail: `fila ${row + 1} ${arrow}`,
        fire: () => {
          engine.shiftRow(row, dir as 1 | -1);
          this.emit({ kind: 'apply', moduleId: 'ev-tremor', name: 'Temblor', detail: `fila ${row + 1} ${arrow}` });
        }
      });
    }
    // Sincroniza flags de gravedad con el motor.
    if (engine.chaos) engine.chaos.gravityMultiplier = this.flags.gravityMultiplier;
  }

  private startModule(module: ChaosModule, duration: number): void {
    // De a uno a la vez: si algo sigue activo, se cierra primero.
    if (this.active) this.endActive();
    module.onStart(this.ctx);
    this.active = { module, remaining: duration };
    this.emit({ kind: 'start', moduleId: module.id, name: module.name, remainingSec: duration });
  }

  private endActive(): void {
    const entry = this.active;
    this.active = null;
    if (entry) {
      entry.module.onEnd(this.ctx);
      this.emit({ kind: 'end', moduleId: entry.module.id, name: entry.module.name });
    }
  }

  /** Proxima pieza especial en cola (para avisar en el preview). */
  peekSpecial(): SpecialKind | null { return this.specialQueue[0] ?? null; }
  /** Nombre del mutador activo (para la cuenta regresiva en el HUD). */
  activeName(): string | null { return this.active ? this.active.module.name : null; }
  activeRemaining(): number { return this.active ? this.active.remaining : 0; }
}
