import { describe, expect, it } from 'vitest';
import type { GameMode, StoredScoreEntry } from '../src/leaderboard/types.js';
import {
  compareScoreEntries,
  isValidNickname,
  maxPlausibleScore,
  sanitizeNickname,
  validateSubmission
} from '../src/leaderboard/rules.js';
import { ApiError } from '../server/errors.js';
import { createScoreService, SUBMIT_LIMIT_PER_HOUR } from '../server/service.js';
import type { LeaderboardStore, SaveResult } from '../server/store.js';

const PLAYER = '11111111-1111-4111-8111-111111111111';
const OTHER_PLAYER = '33333333-3333-4333-8333-333333333333';
const RUN = '22222222-2222-4222-8222-222222222222';
const RUN_2 = '44444444-4444-4444-8444-444444444444';

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    runId: RUN,
    playerId: PLAYER,
    nickname: 'David',
    mode: 'classic',
    score: 12_000,
    level: 8,
    lines: 40,
    startLevel: 1,
    durationMs: 120_000,
    ...overrides
  };
}

/** Doble en memoria del almacén: el servicio se prueba sin red ni Upstash. */
class MemoryStore implements LeaderboardStore {
  readonly entries = new Map<string, StoredScoreEntry>();
  readonly scores: Record<GameMode, Map<string, number>> = { classic: new Map(), chaos: new Map() };
  readonly bests = new Map<string, { score: number; id: string }>();
  readonly runs = new Set<string>();
  readonly counters = new Map<string, number>();

  private sorted(mode: GameMode): StoredScoreEntry[] {
    return [...this.scores[mode].keys()]
      .map((id) => this.entries.get(id))
      .filter((entry): entry is StoredScoreEntry => entry !== undefined)
      .sort(compareScoreEntries);
  }

  async save(entry: StoredScoreEntry, maxEntries: number): Promise<SaveResult> {
    this.entries.set(entry.id, entry);
    this.scores[entry.mode].set(entry.id, entry.score);
    const bestKey = entry.playerId + ':' + entry.mode;
    const previous = this.bests.get(bestKey);
    const improved = entry.score > (previous?.score ?? 0);
    if (improved) this.bests.set(bestKey, { score: entry.score, id: entry.id });

    const order = this.sorted(entry.mode);
    const index = order.findIndex((candidate) => candidate.id === entry.id);
    for (const stale of order.slice(maxEntries)) {
      this.entries.delete(stale.id);
      this.scores[entry.mode].delete(stale.id);
    }
    return {
      rank: index >= 0 && index < maxEntries ? index + 1 : null,
      total: Math.min(order.length, maxEntries),
      personalBestScore: improved ? entry.score : (previous?.score ?? 0),
      personalBestEntryId: improved ? entry.id : (previous?.id ?? ''),
      improved
    };
  }

  async top(mode: GameMode, limit: number): Promise<{ entries: StoredScoreEntry[]; total: number }> {
    return { entries: this.sorted(mode).slice(0, limit), total: this.scores[mode].size };
  }

  async best(playerId: string, mode: GameMode): Promise<{ entry: StoredScoreEntry; rank: number | null } | null> {
    const best = this.bests.get(playerId + ':' + mode);
    if (!best) return null;
    const entry = this.entries.get(best.id);
    if (!entry) return null;
    const index = this.sorted(mode).findIndex((candidate) => candidate.id === best.id);
    return { entry, rank: index < 0 ? null : index + 1 };
  }

  async claimRun(runId: string): Promise<boolean> {
    if (this.runs.has(runId)) return false;
    this.runs.add(runId);
    return true;
  }

  async bumpRateLimit(kind: 'submit' | 'read', ipHash: string): Promise<number> {
    const key = kind + ':' + ipHash;
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }
}

function serviceWith(store: MemoryStore) {
  let tick = 0;
  let id = 0;
  return createScoreService({
    store,
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)),
    newEntryId: () => 'entry-' + String(id++)
  });
}

function rejectionOf(input: unknown): { code: string; field?: string } {
  const result = validateSubmission(input);
  if (result.ok) throw new Error('se esperaba un fallo de validación');
  return result.field === undefined ? { code: result.code } : { code: result.code, field: result.field };
}

async function apiRejection(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('se esperaba un ApiError');
}

describe('reglas de clasificación', () => {
  it('sanea espacios repetidos y caracteres de control', () => {
    expect(sanitizeNickname('  David   Pérez \u0007 ')).toBe('David Pérez');
  });

  it('acepta nombres razonables y rechaza el resto', () => {
    for (const name of ['David', 'María José', 'A1', 'n00b_master', 'Ana-María', 'Punto.Medio·2']) {
      expect(isValidNickname(name), name).toBe(true);
    }
    for (const name of ['A', 'A'.repeat(17), '<script>', 'David!', 'emoji😀', 'puta']) {
      expect(isValidNickname(name), name).toBe(false);
    }
  });

  it('no bloquea palabras que solo contienen una palabra vetada', () => {
    expect(isValidNickname('computadora')).toBe(true);
    expect(isValidNickname('Cassandra')).toBe(true);
  });

  it('valida un envío correcto y sanea el apodo', () => {
    const result = validateSubmission(payload({ nickname: '  David  ', seed: 42 }));
    if (!result.ok) throw new Error(result.message);
    expect(result.value.nickname).toBe('David');
    expect(result.value.mode).toBe('classic');
    expect(result.value.seed).toBe(42);
  });

  it('rechaza identificadores, modos y números inválidos', () => {
    expect(rejectionOf(payload({ runId: 'nope' }))).toEqual({ code: 'invalid_field', field: 'runId' });
    expect(rejectionOf(payload({ playerId: 7 }))).toEqual({ code: 'invalid_field', field: 'playerId' });
    expect(rejectionOf(payload({ mode: 'hardcore' }))).toEqual({ code: 'invalid_field', field: 'mode' });
    expect(rejectionOf(payload({ score: -1 }))).toEqual({ code: 'invalid_field', field: 'score' });
    expect(rejectionOf(payload({ score: 1.5 }))).toEqual({ code: 'invalid_field', field: 'score' });
    expect(rejectionOf(payload({ durationMs: 1000 }))).toEqual({ code: 'invalid_field', field: 'durationMs' });
    expect(rejectionOf(payload({ nickname: '' }))).toEqual({ code: 'invalid_nickname', field: 'nickname' });
    expect(rejectionOf(payload({ level: 21 }))).toEqual({ code: 'invalid_field', field: 'level' });
  });

  it('solo admite partidas empezadas en el nivel 1', () => {
    expect(rejectionOf(payload({ startLevel: 2 }))).toEqual({ code: 'start_level_not_ranked', field: 'startLevel' });
  });

  it('rechaza puntajes imposibles para la duración declarada', () => {
    const result = validateSubmission(payload({ score: maxPlausibleScore(5000) + 1, durationMs: 5000 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('implausible_score');
  });

  it('ordena por puntos y, a igualdad, por antigüedad', () => {
    const base = { nickname: 'A', mode: 'classic' as GameMode, level: 1, lines: 0, startLevel: 1 };
    const entries = [
      { ...base, id: 'b', score: 100, createdAt: '2026-01-01T00:00:00.000Z' },
      { ...base, id: 'c', score: 300, createdAt: '2026-01-02T00:00:00.000Z' },
      { ...base, id: 'a', score: 100, createdAt: '2025-12-31T00:00:00.000Z' }
    ];
    expect(entries.sort(compareScoreEntries).map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
  });

  it('la cota de puntos crece con la duración', () => {
    expect(maxPlausibleScore(60_000)).toBeGreaterThan(maxPlausibleScore(10_000));
  });
});

describe('servicio de clasificación', () => {
  it('guarda una partida y devuelve el puesto público', async () => {
    const store = new MemoryStore();
    const service = serviceWith(store);
    const response = await service.submit({ payload: payload(), ipHash: 'ip-a' });
    expect(response.ranked).toBe(true);
    expect(response.rank).toBe(1);
    expect(response.total).toBe(1);
    expect(response.entry.nickname).toBe('David');
    expect(response.personalBest).toEqual({ score: 12_000, rank: 1, improved: true });
    expect(Object.prototype.hasOwnProperty.call(response.entry, 'playerId')).toBe(false);
  });

  it('es idempotente por runId', async () => {
    const store = new MemoryStore();
    const service = serviceWith(store);
    await service.submit({ payload: payload(), ipHash: 'ip-a' });
    const error = await apiRejection(service.submit({ payload: payload(), ipHash: 'ip-a' }));
    expect(error.status).toBe(409);
    expect(error.code).toBe('duplicate_run');
  });

  it('limita los envíos por IP', async () => {
    const store = new MemoryStore();
    const service = serviceWith(store);
    store.counters.set('submit:ip-b', SUBMIT_LIMIT_PER_HOUR);
    const error = await apiRejection(service.submit({ payload: payload(), ipHash: 'ip-b' }));
    expect(error.status).toBe(429);
    expect(error.code).toBe('rate_limited');
  });

  it('separa Tradicional y Caos en tableros independientes', async () => {
    const store = new MemoryStore();
    const service = serviceWith(store);
    await service.submit({ payload: payload({ mode: 'classic' }), ipHash: 'ip-a' });
    await service.submit({ payload: payload({ mode: 'chaos', runId: RUN_2, score: 30_000 }), ipHash: 'ip-a' });
    const classic = await service.board({ mode: 'classic', limit: 10, playerId: undefined, ipHash: 'ip-c' });
    const chaos = await service.board({ mode: 'chaos', limit: 10, playerId: undefined, ipHash: 'ip-c' });
    expect(classic.entries).toHaveLength(1);
    expect(chaos.entries).toHaveLength(1);
    expect(classic.entries[0]?.mode).toBe('classic');
    expect(chaos.entries[0]?.mode).toBe('chaos');
    expect(chaos.entries[0]?.score).toBe(30_000);
  });

  it('devuelve mi mejor marca cuando llega playerId', async () => {
    const store = new MemoryStore();
    const service = serviceWith(store);
    await service.submit({ payload: payload(), ipHash: 'ip-a' });
    const board = await service.board({ mode: 'classic', limit: 10, playerId: PLAYER, ipHash: 'ip-c' });
    expect(board.me?.rank).toBe(1);
    expect(board.me?.entry.score).toBe(12_000);
  });

  it('no marca improved si la partida no supera la mejor marca', async () => {
    const store = new MemoryStore();
    const service = serviceWith(store);
    await service.submit({ payload: payload(), ipHash: 'ip-a' });
    const other = await service.submit({
      payload: payload({ runId: RUN_2, playerId: OTHER_PLAYER, score: 9_000, nickname: 'Otra' }),
      ipHash: 'ip-a'
    });
    expect(other.personalBest.improved).toBe(true);
    const repeated = await service.submit({
      payload: payload({ runId: '55555555-5555-4555-8555-555555555555', score: 5_000 }),
      ipHash: 'ip-a'
    });
    expect(repeated.personalBest.improved).toBe(false);
    expect(repeated.personalBest.score).toBe(12_000);
    expect(repeated.personalBest.rank).toBe(1);
    expect(repeated.rank).toBe(3);
  });

  it('rechaza modos y payloads inválidos y limita las lecturas', async () => {
    const store = new MemoryStore();
    const service = serviceWith(store);
    const badMode = await apiRejection(service.board({ mode: 'x', limit: 10, playerId: undefined, ipHash: 'ip-d' }));
    expect(badMode.status).toBe(400);

    const badPayload = await apiRejection(service.submit({ payload: payload({ startLevel: 3 }), ipHash: 'ip-e' }));
    expect(badPayload.status).toBe(400);
    expect(badPayload.code).toBe('start_level_not_ranked');

    store.counters.set('read:ip-f', 60);
    const limited = await apiRejection(service.board({ mode: 'classic', limit: 10, playerId: undefined, ipHash: 'ip-f' }));
    expect(limited.status).toBe(429);
  });
});


