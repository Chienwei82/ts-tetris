import type { TetrisEngine } from '../engine.js';
import type { ChaosConfig } from './config.js';

/** Contexto que el director pasa a cada modulo caos. */
export interface ChaosContext {
  engine: TetrisEngine;
  config: ChaosConfig;
  rng: () => number;
  emit: (event: ChaosEvent) => void;
  flags: ChaosFlags;
}

/** Flags de estado que los modulos activan y `main.ts` consume para vista/entrada. */
export interface ChaosFlags {
  gravityMultiplier: number;
  invertedControls: boolean;
  hiddenNext: boolean;
  fogTopHalf: boolean;
  ghostActive: boolean;
}

export function createChaosFlags(): ChaosFlags {
  return { gravityMultiplier: 1, invertedControls: false, hiddenNext: false, fogTopHalf: false, ghostActive: false };
}

/** Interfaz comun de mutadores y eventos telegrafiados. */
export interface ChaosModule {
  readonly id: string;
  readonly name: string;
  readonly durationSec: number;
  onStart: (ctx: ChaosContext) => void;
  onTick: (ctx: ChaosContext, dt: number) => void;
  onEnd: (ctx: ChaosContext) => void;
}

export type ChaosEventKind = 'warn' | 'start' | 'tick' | 'end' | 'apply';

export interface ChaosEvent {
  kind: ChaosEventKind;
  moduleId: string;
  name: string;
  remainingSec?: number;
  detail?: string;
}
