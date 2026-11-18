import { MAX_LEVEL } from '../game/types.js';
import type { GameMode } from '../game/types.js';

export type { GameMode };

/**
 * Tipos compartidos por el cliente y el API de clasificación. Este módulo es
 * puro (sin DOM ni Node) para poder importarlo desde ambos lados y testearlo.
 */

/** Modos con clasificación independiente (requisito de producto). */
export const LEADERBOARD_MODES: readonly GameMode[] = ['classic', 'chaos'];

/** Entradas que se conservan por modo en el almacén (las mejores). */
export const MAX_ENTRIES_KEPT = 200;
/** Filas que devuelve la API si el cliente no pide otra cosa. */
export const DEFAULT_BOARD_LIMIT = 50;
/** Tope de filas por petición (evita respuestas enormes). */
export const MAX_BOARD_LIMIT = 100;

export const MIN_NICKNAME_LENGTH = 2;
export const MAX_NICKNAME_LENGTH = 16;

/** Duración mínima/máxima aceptada de una partida (anti-abuso básico). */
export const MIN_DURATION_MS = 5_000;
export const MAX_DURATION_MS = 6 * 60 * 60 * 1000;

/** Cotas de cordura para los campos numéricos. */
export const MAX_SCORE = 100_000_000;
export const MAX_LINES = 1_000_000;
export { MAX_LEVEL };

/** Entrada pública: lo que ve cualquier visitante del ranking. */
export interface ScoreEntry {
  id: string;
  nickname: string;
  mode: GameMode;
  score: number;
  level: number;
  lines: number;
  startLevel: number;
  /** ISO-8601 en UTC. */
  createdAt: string;
}

/** Entrada tal y como se guarda: añade datos internos que no se publican. */
export interface StoredScoreEntry extends ScoreEntry {
  playerId: string;
  seed?: number;
}

/** Payload que envía el juego al terminar una partida. */
export interface ScoreSubmission {
  /** UUID generado al empezar la partida: idempotencia del envío. */
  runId: string;
  /** UUID anónimo persistente del jugador (localStorage). */
  playerId: string;
  nickname: string;
  mode: GameMode;
  score: number;
  level: number;
  lines: number;
  /** Nivel elegido en el selector al empezar. Solo el nivel 1 entra al ranking. */
  startLevel: number;
  /** Tiempo jugado (sin pausas ni pestaña oculta). */
  durationMs: number;
  seed?: number;
  appVersion?: string;
}

export interface PersonalBest {
  score: number;
  /** Puesto global (1 = mejor) o `null` si la marca no está en la tabla. */
  rank: number | null;
  /** Solo en el envío: ¿esta partida mejoró la marca personal del modo? */
  improved: boolean;
}

export interface SubmitScoreResponse {
  ranked: boolean;
  rank: number | null;
  entry: ScoreEntry;
  personalBest: PersonalBest;
  total: number;
}

export interface BoardMe {
  rank: number | null;
  entry: ScoreEntry;
}

export interface LeaderboardResponse {
  mode: GameMode;
  total: number;
  entries: ScoreEntry[];
  me?: BoardMe;
}

/** Cuerpo estable de error de la API. */
export interface ApiErrorBody {
  error: string;
  message: string;
  field?: string;
}
