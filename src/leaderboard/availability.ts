import { fetchLeaderboard, LeaderboardError } from './client.js';
import type { GameMode } from './types.js';

/** Resultado de la sonda de disponibilidad del API. */
export interface LeaderboardAvailability {
  available: boolean;
  message: string;
}

/** Tiempo máximo de la sonda: no debe retrasar el arranque del juego. */
export const AVAILABILITY_TIMEOUT_MS = 4_000;

export const OFFLINE_MESSAGE = 'Sin conexión con la clasificación. El juego funciona igual; vuelve a intentarlo más tarde.';
export const SERVER_DOWN_MESSAGE = 'La clasificación no está disponible ahora mismo. El juego funciona igual; vuelve a intentarlo más tarde.';
export const SLOW_MESSAGE = 'La clasificación tarda en responder. Vuelve a intentarlo en un momento.';

/**
 * Traduce un error del cliente a un estado de disponibilidad. Un 429 implica
 * que el API SÍ responde (solo pide esperar), así que no se marca como caída.
 */
export function describeLeaderboardError(error: unknown): LeaderboardAvailability {
  if (!(error instanceof LeaderboardError)) {
    return { available: false, message: SERVER_DOWN_MESSAGE };
  }
  if (error.code === 'rate_limited') return { available: true, message: '' };
  if (error.code === 'network') return { available: false, message: OFFLINE_MESSAGE };
  if (error.code === 'timeout') return { available: false, message: SLOW_MESSAGE };
  if (error.code === 'storage_unavailable' || error.status === 404 || error.status >= 500) {
    return { available: false, message: SERVER_DOWN_MESSAGE };
  }
  return { available: true, message: '' };
}

/** Sonda ligera: reutiliza el GET del tablero pidiendo una sola fila. */
export async function checkLeaderboardAvailability(mode: GameMode): Promise<LeaderboardAvailability> {
  try {
    await fetchLeaderboard(mode, { limit: 1, timeoutMs: AVAILABILITY_TIMEOUT_MS });
    return { available: true, message: '' };
  } catch (error) {
    return describeLeaderboardError(error);
  }
}
