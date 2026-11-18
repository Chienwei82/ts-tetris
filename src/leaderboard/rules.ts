import {
  MAX_DURATION_MS,
  MAX_LEVEL,
  MAX_LINES,
  MAX_NICKNAME_LENGTH,
  MAX_SCORE,
  MIN_DURATION_MS,
  MIN_NICKNAME_LENGTH
} from './types.js';
import type { GameMode, ScoreEntry, ScoreSubmission, StoredScoreEntry } from './types.js';

/**
 * Reglas puras de la clasificación: sanitizado, validación y orden. Se usan en
 * el navegador (para dar feedback inmediato) y en el servidor (fuente de verdad).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Letras/números Unicode, con espacio, punto, guion, guion bajo y punto medio dentro. */
const NICKNAME_RE = /^[\p{L}\p{N}](?:[\p{L}\p{N} ._\-·]*[\p{L}\p{N}])?$/u;
const APP_VERSION_RE = /^[0-9A-Za-z._-]{1,32}$/;

/** Palabras bloqueadas (se comparan por token, no por subcadena). */
const BLOCKED_WORDS: ReadonlySet<string> = new Set([
  'puta', 'puto', 'mierda', 'cabron', 'pendejo', 'imbecil', 'gilipollas',
  'maricon', 'nazi', 'hitler', 'pedofilo', 'violador',
  'fuck', 'shit', 'bitch', 'asshole', 'nigger', 'nigga', 'retard', 'rape'
]);

export function isGameMode(value: unknown): value is GameMode {
  return value === 'classic' || value === 'chaos';
}

/** UUID v4 (o cualquier variante 1–5) tal y como lo genera `crypto.randomUUID()`. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Normaliza espacios y quita caracteres de control. No recorta la longitud. */
export function sanitizeNickname(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
}

function nicknameTokens(raw: string): string[] {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
}

export function isBlockedNickname(raw: string): boolean {
  return nicknameTokens(raw).some((token) => BLOCKED_WORDS.has(token));
}

/** Valida el nombre ya saneado. Devuelve el motivo para poder explicarlo. */
export function nicknameProblem(raw: string): 'length' | 'chars' | 'blocked' | null {
  const name = sanitizeNickname(raw);
  const length = Array.from(name).length;
  if (length < MIN_NICKNAME_LENGTH || length > MAX_NICKNAME_LENGTH) return 'length';
  if (!NICKNAME_RE.test(name)) return 'chars';
  if (isBlockedNickname(name)) return 'blocked';
  return null;
}

export function isValidNickname(raw: string): boolean {
  return nicknameProblem(raw) === null;
}

/** Cota holgada pero suficiente para frenar puntajes absurdos. */
export function maxPlausibleScore(durationMs: number): number {
  const seconds = Math.max(0, durationMs) / 1000;
  return Math.floor(seconds * 20_000) + 10_000;
}

export interface ValidationOk {
  ok: true;
  value: ScoreSubmission;
}
export interface ValidationFailure {
  ok: false;
  code: string;
  message: string;
  field?: string;
}
export type ValidationResult = ValidationOk | ValidationFailure;

function fail(code: string, message: string, field?: string): ValidationFailure {
  return field === undefined ? { ok: false, code, message } : { ok: false, code, message, field };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function intField(
  source: Record<string, unknown>,
  field: string,
  min: number,
  max: number
): number | ValidationFailure {
  const value = source[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return fail('invalid_field', 'El campo "' + field + '" debe ser un entero entre ' + min + ' y ' + max + '.', field);
  }
  return value;
}

function isFailure(value: number | ValidationFailure): value is ValidationFailure {
  return typeof value !== 'number';
}

/**
 * Valida el payload de un envío. Es la MISMA función que usa el servidor:
 * el cliente solo la aprovecha para avisar antes de enviar.
 */
export function validateSubmission(input: unknown): ValidationResult {
  if (!isRecord(input)) return fail('invalid_body', 'El cuerpo debe ser un objeto JSON.');

  const runId = input.runId;
  if (typeof runId !== 'string' || !UUID_RE.test(runId)) {
    return fail('invalid_field', 'El identificador de partida no es válido.', 'runId');
  }
  const playerId = input.playerId;
  if (typeof playerId !== 'string' || !UUID_RE.test(playerId)) {
    return fail('invalid_field', 'El identificador de jugador no es válido.', 'playerId');
  }

  const rawNickname = input.nickname;
  if (typeof rawNickname !== 'string') {
    return fail('invalid_field', 'Falta el nombre del jugador.', 'nickname');
  }
  const nickname = sanitizeNickname(rawNickname);
  const problem = nicknameProblem(nickname);
  if (problem === 'length') {
    return fail('invalid_nickname', 'El nombre debe tener entre ' + MIN_NICKNAME_LENGTH + ' y ' + MAX_NICKNAME_LENGTH + ' caracteres.', 'nickname');
  }
  if (problem === 'chars') {
    return fail('invalid_nickname', 'El nombre solo admite letras, números, espacios, punto, guion y punto medio.', 'nickname');
  }
  if (problem === 'blocked') {
    return fail('nickname_blocked', 'Ese nombre no está permitido.', 'nickname');
  }

  if (!isGameMode(input.mode)) {
    return fail('invalid_field', 'El modo debe ser "classic" o "chaos".', 'mode');
  }

  const score = intField(input, 'score', 0, MAX_SCORE);
  if (isFailure(score)) return score;
  const level = intField(input, 'level', 1, MAX_LEVEL);
  if (isFailure(level)) return level;
  const lines = intField(input, 'lines', 0, MAX_LINES);
  if (isFailure(lines)) return lines;
  const startLevel = intField(input, 'startLevel', 1, MAX_LEVEL);
  if (isFailure(startLevel)) return startLevel;
  const durationMs = intField(input, 'durationMs', MIN_DURATION_MS, MAX_DURATION_MS);
  if (isFailure(durationMs)) return durationMs;

  let seed: number | undefined;
  if (input.seed !== undefined) {
    const parsedSeed = intField(input, 'seed', 0, 0xFFFFFFFF);
    if (isFailure(parsedSeed)) return parsedSeed;
    seed = parsedSeed;
  }

  if (level < startLevel) {
    return fail('invalid_field', 'El nivel final no puede ser menor que el inicial.', 'level');
  }
  if (startLevel !== 1) {
    return fail('start_level_not_ranked', 'Solo las partidas empezadas en el nivel 1 entran en la clasificación.', 'startLevel');
  }
  if (score > maxPlausibleScore(durationMs)) {
    return fail('implausible_score', 'La puntuación no es coherente con la duración de la partida.', 'score');
  }

  const value: ScoreSubmission = {
    runId,
    playerId,
    nickname,
    mode: input.mode,
    score,
    level,
    lines,
    startLevel,
    durationMs
  };
  if (seed !== undefined) value.seed = seed;
  const appVersion = input.appVersion;
  if (typeof appVersion === 'string' && APP_VERSION_RE.test(appVersion)) value.appVersion = appVersion;
  return { ok: true, value };
}

/** Orden del tablero: más puntos primero; a igualdad, la partida más antigua. */
export function compareScoreEntries(a: ScoreEntry, b: ScoreEntry): number {
  if (b.score !== a.score) return b.score - a.score;
  const ta = Date.parse(a.createdAt);
  const tb = Date.parse(b.createdAt);
  if (ta !== tb) return ta - tb;
  return a.id.localeCompare(b.id);
}

/** Quita datos internos antes de enviar una entrada al navegador. */
export function toPublicEntry(entry: StoredScoreEntry): ScoreEntry {
  return {
    id: entry.id,
    nickname: entry.nickname,
    mode: entry.mode,
    score: entry.score,
    level: entry.level,
    lines: entry.lines,
    startLevel: entry.startLevel,
    createdAt: entry.createdAt
  };
}
