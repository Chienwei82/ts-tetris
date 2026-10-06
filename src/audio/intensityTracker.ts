/**
 * IntensityTracker: convierte señales del juego en un único parámetro
 * `intensity` (0..1) suavizado. Módulo puro (sin DOM ni WebAudio) y testeable.
 *
 * Señales disponibles en este juego (Tetris no tiene enemigos ni velocidad de
 * scroll): altura de la pila, nivel, progreso del nivel, combo y eventos
 * puntuales (clears, Tetris, hard drops, level-up) como pulsos que decaen.
 */
import { EVENT_DECAY_TAU_S, SMOOTHING_DOWN_S, SMOOTHING_UP_S } from './musicConstants.js';

/** Señales del juego ya normalizadas por quien llama. */
export interface IntensitySignals {
  /** Altura de la pila (0..1): filas ocupadas / filas visibles. */
  stackHeight: number;
  /** Nivel de dificultad normalizado (0..1). */
  level: number;
  /** Progreso dentro del nivel (0..1). */
  levelProgress: number;
  /** Combo activo (valor crudo; se recorta internamente). */
  combo: number;
}

export type IntensityEventKind = 'clear' | 'tetris' | 'harddrop' | 'levelup' | 'combo';

/** Pulso que añade cada evento antes del decaimiento exponencial. */
export const PULSE_BY_EVENT: Record<IntensityEventKind, number> = {
  clear: 0.15,
  tetris: 0.3,
  harddrop: 0.03,
  levelup: 0.2,
  combo: 0.06
};

const WEIGHT_STACK = 0.45;
const WEIGHT_LEVEL = 0.25;
const WEIGHT_PROGRESS = 0.15;
const WEIGHT_COMBO = 0.1;
const COMBO_CLIP = 4;
const PULSE_CLIP = 0.35;
const MAX_DT_S = 0.25;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export interface TrackerOptions {
  smoothingUp?: number;
  smoothingDown?: number;
  decayTau?: number;
}

export class IntensityTracker {
  private value = 0;
  private pulse = 0;
  private readonly upTau: number;
  private readonly downTau: number;
  private readonly decayTau: number;
  constructor(opts: TrackerOptions = {}) {
    this.upTau = opts.smoothingUp ?? SMOOTHING_UP_S;
    this.downTau = opts.smoothingDown ?? SMOOTHING_DOWN_S;
    this.decayTau = opts.decayTau ?? EVENT_DECAY_TAU_S;
  }
  /** Vuelve a la calma (reinicio de nivel/partida). */
  reset(): void {
    this.value = 0;
    this.pulse = 0;
  }
  /** Registra un evento que eleva la tensión momentáneamente. */
  event(kind: IntensityEventKind): void {
    this.pulse = Math.min(PULSE_CLIP, this.pulse + (PULSE_BY_EVENT[kind] ?? 0));
  }
  get current(): number {
    return this.value;
  }
  /** Paso de suavizado; devuelve la intensidad ya filtrada. */
  update(dt: number, s: IntensitySignals): number {
    const step = Math.max(0, Math.min(dt, MAX_DT_S));
    this.pulse *= Math.exp(-step / this.decayTau);
    const base =
      WEIGHT_STACK * clamp01(s.stackHeight) +
      WEIGHT_LEVEL * clamp01(s.level) +
      WEIGHT_PROGRESS * clamp01(s.levelProgress) +
      WEIGHT_COMBO * Math.min(1, Math.max(0, s.combo) / COMBO_CLIP);
    const target = clamp01(base + this.pulse);
    // Filtro exponencial asimétrico: sube con rapidez, baja con calma.
    const tau = target > this.value ? this.upTau : this.downTau;
    const k = 1 - Math.exp(-step / tau);
    this.value += (target - this.value) * k;
    return this.value;
  }
}