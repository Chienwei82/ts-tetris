import type { ApiErrorBody, LeaderboardResponse, ScoreSubmission, SubmitScoreResponse } from './types.js';
import { DEFAULT_BOARD_LIMIT, MAX_BOARD_LIMIT } from './types.js';
import type { GameMode } from '../game/types.js';

const API_PATH = '/api/scores';
const DEFAULT_TIMEOUT_MS = 8_000;

/** Error normalizado del API: el UI decide el mensaje sin mirar HTTP a mano. */
export class LeaderboardError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'LeaderboardError';
    this.code = code;
    this.status = status;
  }
}

function isLeaderboardResponse(value: unknown): value is LeaderboardResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as { entries?: unknown; total?: unknown; mode?: unknown };
  return Array.isArray(candidate.entries) && typeof candidate.total === 'number' && typeof candidate.mode === 'string';
}

function errorFromBody(body: unknown, status: number): LeaderboardError {
  if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
    const candidate = body as Partial<ApiErrorBody>;
    if (typeof candidate.error === 'string') {
      const message = typeof candidate.message === 'string' ? candidate.message : 'Error del servidor.';
      return new LeaderboardError(message, candidate.error, status);
    }
  }
  return new LeaderboardError('Error del servidor.', 'server_error', status);
}

async function requestJson<T>(url: string, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  // `setTimeout` global (no `window`) también funciona en Vitest/Node.
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) throw errorFromBody(body, response.status);
    return body as T;
  } catch (error) {
    if (error instanceof LeaderboardError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new LeaderboardError('El servidor tardó demasiado en responder.', 'timeout', 0);
    }
    throw new LeaderboardError('No se pudo conectar con la clasificación.', 'network', 0);
  } finally {
    clearTimeout(timer);
  }
}

/** Ranking del modo pedido (nunca mezcla Tradicional y Caos). */
export async function fetchLeaderboard(
  mode: GameMode,
  options: { playerId?: string; limit?: number; timeoutMs?: number } = {}
): Promise<LeaderboardResponse> {
  const params = new URLSearchParams({ mode });
  params.set('limit', String(Math.min(MAX_BOARD_LIMIT, Math.max(1, options.limit ?? DEFAULT_BOARD_LIMIT))));
  if (options.playerId) params.set('playerId', options.playerId);
  const body = await requestJson<unknown>(API_PATH + '?' + params.toString(), { method: 'GET' }, options.timeoutMs);
  // Un servidor estático puede devolver 200 con el index.html de fallback.
  if (!isLeaderboardResponse(body)) {
    throw new LeaderboardError('La respuesta de la clasificación no es válida.', 'server_error', 502);
  }
  return body;
}

/** Envía una partida terminada. El servidor valida y decide el puesto. */
export async function submitScore(payload: ScoreSubmission): Promise<SubmitScoreResponse> {
  return requestJson<SubmitScoreResponse>(API_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
