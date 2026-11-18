import { randomUUID } from 'node:crypto';
import { isGameMode, isUuid, toPublicEntry, validateSubmission } from '../src/leaderboard/rules.js';
import {
  DEFAULT_BOARD_LIMIT,
  MAX_BOARD_LIMIT,
  MAX_ENTRIES_KEPT
} from '../src/leaderboard/types.js';
import type {
  GameMode,
  LeaderboardResponse,
  PersonalBest,
  StoredScoreEntry,
  SubmitScoreResponse
} from '../src/leaderboard/types.js';
import { ApiError } from './errors.js';
import type { LeaderboardStore } from './store.js';

/** Límites por IP (hasheada): holgados para jugadores, duros para bots. */
export const SUBMIT_LIMIT_PER_HOUR = 12;
export const READ_LIMIT_PER_MINUTE = 60;

export interface BoardCommand {
  mode: unknown;
  limit: unknown;
  playerId: unknown;
  ipHash: string;
}

export interface SubmitCommand {
  payload: unknown;
  ipHash: string;
}

export interface ScoreService {
  board(command: BoardCommand): Promise<LeaderboardResponse>;
  submit(command: SubmitCommand): Promise<SubmitScoreResponse>;
}

export interface ScoreServiceOptions {
  store: LeaderboardStore;
  now?: () => Date;
  newEntryId?: () => string;
}

function parseLimit(value: unknown): number {
  const raw = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(raw)) return DEFAULT_BOARD_LIMIT;
  return Math.min(MAX_BOARD_LIMIT, Math.max(1, Math.trunc(raw)));
}

export function createScoreService(options: ScoreServiceOptions): ScoreService {
  const store = options.store;
  const now = options.now ?? ((): Date => new Date());
  const newEntryId = options.newEntryId ?? ((): string => randomUUID());

  async function board(command: BoardCommand): Promise<LeaderboardResponse> {
    if (!isGameMode(command.mode)) {
      throw new ApiError(400, 'invalid_field', 'El modo debe ser "classic" o "chaos".', 'mode');
    }
    const hits = await store.bumpRateLimit('read', command.ipHash);
    if (hits > READ_LIMIT_PER_MINUTE) {
      throw new ApiError(429, 'rate_limited', 'Demasiadas consultas. Espera un minuto y reinténtalo.');
    }
    const mode: GameMode = command.mode;
    const limit = parseLimit(command.limit);
    const page = await store.top(mode, limit);
    const response: LeaderboardResponse = {
      mode,
      total: page.total,
      entries: page.entries.map(toPublicEntry)
    };
    if (isUuid(command.playerId)) {
      const best = await store.best(command.playerId, mode);
      if (best) response.me = { rank: best.rank, entry: toPublicEntry(best.entry) };
    }
    return response;
  }

  async function submit(command: SubmitCommand): Promise<SubmitScoreResponse> {
    const hits = await store.bumpRateLimit('submit', command.ipHash);
    if (hits > SUBMIT_LIMIT_PER_HOUR) {
      throw new ApiError(429, 'rate_limited', 'Demasiados envíos seguidos. Espera un rato y vuelve a intentarlo.');
    }

    const validation = validateSubmission(command.payload);
    if (!validation.ok) {
      throw new ApiError(400, validation.code, validation.message, validation.field);
    }
    const value = validation.value;

    const claimed = await store.claimRun(value.runId);
    if (!claimed) {
      throw new ApiError(409, 'duplicate_run', 'Esta partida ya se había enviado.');
    }

    const entry: StoredScoreEntry = {
      id: newEntryId(),
      nickname: value.nickname,
      mode: value.mode,
      score: value.score,
      level: value.level,
      lines: value.lines,
      startLevel: value.startLevel,
      createdAt: now().toISOString(),
      playerId: value.playerId
    };
    if (value.seed !== undefined) entry.seed = value.seed;

    const saved = await store.save(entry, MAX_ENTRIES_KEPT);
    const personalBest: PersonalBest = {
      score: saved.personalBestScore,
      rank: saved.rank,
      improved: saved.improved
    };
    // Si no mejoró, completamos el puesto real de su mejor marca anterior.
    if (!saved.improved && saved.personalBestEntryId !== '') {
      const previous = await store.best(value.playerId, value.mode);
      if (previous) {
        personalBest.score = previous.entry.score;
        personalBest.rank = previous.rank;
      }
    }

    return {
      ranked: saved.rank !== null,
      rank: saved.rank,
      entry: toPublicEntry(entry),
      personalBest,
      total: saved.total
    };
  }

  return { board, submit };
}
