import { COLS } from '../types.js';
import { mulberry32 } from '../rng.js';
import { DEFAULT_MUTATOR_CONFIG } from './config.js';
import type { MutatorConfig } from './config.js';
import type { MutatorEvent, MutatorHost, MutatorId, Vec2, WindDir } from './types.js';

type Phase = 'idle' | 'warn' | 'active';

export interface MutatorDirectorOptions {
  /** Semilla de reglas: misma semilla ⇒ misma secuencia de tormentas. */
  seed: number;
  /** Solo el modo Caos activa tormentas. */
  enabled: boolean;
  host: MutatorHost;
  config?: Partial<MutatorConfig>;
  onEvent?: (e: MutatorEvent) => void;
}

/** Sal fija: el ciclo de tormentas no comparte flujo con los powerups. */
const SEED_SALT = 0x5bd1e995;

/**
 * Director de tormentas del modo Caos.
 *
 * Ciclo: `idle` → aviso (`warn`) → activo → `idle` (con descanso). Solo hay una
 * tormenta a la vez y nunca se repite la misma dos veces seguidas (si hay más
 * de una en el pool). El viento añade su propio subciclo: flecha de aviso
 * (>= 1 s) → empuje → espera. Todas las decisiones (qué tormenta, cuándo y
 * hacia dónde sopla) salen de este RNG con semilla; la vista solo las decora.
 */
export class MutatorDirector {
  readonly config: MutatorConfig;
  private readonly seed: number;
  private readonly enabled: boolean;
  private readonly host: MutatorHost;
  private readonly onEvent?: (e: MutatorEvent) => void;
  private rng: () => number;
  private phase: Phase = 'idle';
  private current: MutatorId | null = null;
  private last: MutatorId | null = null;
  private timer = 0;
  private windDir: WindDir = 1;
  private gustTimer = 0;
  private gustWarned = false;
  private strikeTimer = 0;
  private fallTimer = 0;
  private meltTimer = 0;
  private hasHail = false;

  constructor(opts: MutatorDirectorOptions) {
    this.seed = opts.seed >>> 0;
    this.enabled = opts.enabled;
    this.host = opts.host;
    this.onEvent = opts.onEvent;
    const merged: MutatorConfig = { ...DEFAULT_MUTATOR_CONFIG, ...(opts.config ?? {}) };
    // La flecha siempre se anuncia con al menos 1 segundo de antelación.
    this.config = { ...merged, windWarnSec: Math.max(1, merged.windWarnSec) };
    this.rng = this.createRng();
    this.timer = this.config.firstDelaySec;
  }

  /** Reinicia el ciclo completo (nueva partida) conservando la semilla. */
  reset(): void {
    if (this.current === 'rain') this.host.setSlippery(false);
    this.rng = this.createRng();
    this.phase = 'idle';
    this.current = null;
    this.last = null;
    this.timer = this.config.firstDelaySec;
    this.gustTimer = 0;
    this.gustWarned = false;
    this.strikeTimer = 0;
    this.fallTimer = 0;
    this.meltTimer = 0;
    this.hasHail = false;
  }

  /** Tormenta activa, o `null` si no hay ninguna. */
  get activeMutator(): MutatorId | null {
    return this.phase === 'active' ? this.current : null;
  }

  /** Tormenta anunciada que aún no ha empezado. */
  get warningMutator(): MutatorId | null {
    return this.phase === 'warn' ? this.current : null;
  }

  isActive(id: MutatorId): boolean {
    return this.phase === 'active' && this.current === id;
  }

  /** Avanza el ciclo. El motor solo lo llama mientras la partida está en curso. */
  update(dt: number): void {
    if (!this.enabled || dt <= 0) return;

    // Derretir granizo temporal cuando corresponda.
    if (this.hasHail) {
      this.meltTimer -= dt;
      if (this.meltTimer <= 0) {
        this.host.meltHail();
        this.hasHail = false;
      }
    }

    if (this.phase === 'idle') {
      this.timer -= dt;
      if (this.timer > 0) return;
      const next = this.pick();
      if (!next) return;
      this.current = next;
      this.phase = 'warn';
      this.timer = this.config.warnSec;
      this.emit({ kind: 'warn', mutator: next, seconds: this.config.warnSec });
      return;
    }

    if (this.phase === 'warn') {
      this.timer -= dt;
      if (this.timer > 0) return;
      const mutator = this.current;
      if (!mutator) {
        this.phase = 'idle';
        this.timer = this.config.cooldownSec;
        return;
      }
      this.phase = 'active';
      this.timer = this.config.activeSec;
      this.emit({ kind: 'start', mutator, seconds: this.config.activeSec });
      if (mutator === 'rain') this.host.setSlippery(true);
      else if (mutator === 'wind') this.beginWind();
      else if (mutator === 'lightning') {
        this.strikeTimer = Math.min(this.config.activeSec, Math.max(0.1, this.config.lightningFirstStrikeSec));
      } else if (mutator === 'hail') {
        this.fallTimer = Math.min(this.config.activeSec, Math.max(0.1, this.config.hailFirstFallSec));
      }
      return;
    }

    this.timer -= dt;
    if (this.current === 'wind') this.updateWind(dt);
    else if (this.current === 'lightning') this.updateLightning(dt);
    else if (this.current === 'hail') this.updateHail(dt);
    if (this.timer <= 0) this.finishActive();
  }

  private createRng(): () => number {
    return mulberry32((this.seed ^ SEED_SALT) >>> 0);
  }

  private emit(e: MutatorEvent): void {
    this.onEvent?.(e);
  }

  /** Elige la siguiente tormenta evitando repetir la anterior. */
  private pick(): MutatorId | null {
    const pool = this.config.pool;
    if (pool.length === 0) return null;
    const usable = pool.length > 1 ? pool.filter((m) => m !== this.last) : pool;
    const idx = Math.min(usable.length - 1, Math.floor(this.rng() * usable.length));
    return usable[Math.max(0, idx)] ?? null;
  }

  private pickDir(): WindDir {
    return this.rng() < 0.5 ? -1 : 1;
  }

  private beginWind(): void {
    this.windDir = this.pickDir();
    // Nunca menos de windWarnSec: la flecha debe verse antes del primer empuje.
    this.gustTimer = Math.min(this.config.activeSec, Math.max(this.config.windWarnSec, this.config.windFirstGustSec));
    this.gustWarned = false;
  }

  private updateWind(dt: number): void {
    this.gustTimer -= dt;
    if (!this.gustWarned && this.gustTimer <= this.config.windWarnSec) {
      this.gustWarned = true;
      this.emit({ kind: 'wind-warn', dir: this.windDir, seconds: this.config.windWarnSec });
    }
    if (this.gustTimer > 0) return;
    const dir = this.windDir;
    const moved = this.host.pushWind(dir);
    this.emit({ kind: 'wind-gust', dir, moved });
    this.windDir = this.pickDir();
    this.gustTimer = this.config.windIntervalSec;
    this.gustWarned = false;
    // Intervalos más cortos que el aviso: la flecha del siguiente empuje sale ya.
    if (this.gustTimer <= this.config.windWarnSec) {
      this.gustWarned = true;
      this.emit({ kind: 'wind-warn', dir: this.windDir, seconds: this.config.windWarnSec });
    }
  }

  private updateLightning(dt: number): void {
    this.strikeTimer -= dt;
    if (this.strikeTimer > 0) return;
    const cells = this.pickLightningCells();
    if (cells.length > 0) {
      this.host.lightningStrike(cells);
      this.emit({ kind: 'lightning', cells });
    }
    this.strikeTimer = this.config.lightningIntervalSec;
  }

  private updateHail(dt: number): void {
    this.fallTimer -= dt;
    if (this.fallTimer > 0) return;
    const columns = this.pickHailColumns();
    if (columns.length > 0) {
      this.host.dropHail(columns);
      this.emit({ kind: 'hail', columns });
      this.hasHail = true;
      this.meltTimer = this.config.hailMeltSec;
    }
    this.fallTimer = this.config.hailIntervalSec;
  }

  private pickLightningCells(): Vec2[] {
    const breaks = this.config.lightningBreaks;
    const cols = this.host.occupiedColumns();
    if (cols.length === 0) return [];
    const count = Math.min(breaks, cols.length);
    const pool = [...cols];
    const chosenCols: number[] = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.min(pool.length - 1, Math.floor(this.rng() * pool.length));
      chosenCols.push(pool.splice(idx, 1)[0]!);
    }
    const cells: Vec2[] = [];
    for (const c of chosenCols) {
      const y = this.host.topCell(c);
      if (y >= 0) cells.push({ x: c, y });
    }
    return cells;
  }

  private pickHailColumns(): number[] {
    const count = this.config.hailMaxPerWave;
    const pool = Array.from({ length: COLS }, (_, i) => i);
    const out: number[] = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.min(pool.length - 1, Math.floor(this.rng() * pool.length));
      out.push(pool.splice(idx, 1)[0]!);
    }
    return out;
  }

  private finishActive(): void {
    const mutator = this.current;
    if (mutator) {
      if (mutator === 'rain') this.host.setSlippery(false);
      this.emit({ kind: 'end', mutator });
      this.last = mutator;
    }
    this.current = null;
    this.phase = 'idle';
    this.timer = this.config.cooldownSec;
    this.gustTimer = 0;
    this.gustWarned = false;
    this.strikeTimer = 0;
    this.fallTimer = 0;
  }
}
