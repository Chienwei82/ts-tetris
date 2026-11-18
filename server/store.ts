import { compareScoreEntries } from '../src/leaderboard/rules.js';
import type { GameMode, StoredScoreEntry } from '../src/leaderboard/types.js';
import type { RedisClient, RedisCommand } from './redis.js';

/** Resultado de guardar una partida. */
export interface SaveResult {
  /** Puesto 1-based o `null` si la partida no entró en la tabla. */
  rank: number | null;
  /** Entradas conservadas en el modo tras la purga. */
  total: number;
  personalBestScore: number;
  personalBestEntryId: string;
  improved: boolean;
}

/** Semántica del almacén: el servicio no conoce Redis y los tests usan un doble. */
export interface LeaderboardStore {
  save(entry: StoredScoreEntry, maxEntries: number): Promise<SaveResult>;
  top(mode: GameMode, limit: number): Promise<{ entries: StoredScoreEntry[]; total: number }>;
  best(playerId: string, mode: GameMode): Promise<{ entry: StoredScoreEntry; rank: number | null } | null>;
  /** `true` si el runId es nuevo (SET NX); `false` si ya se usó. */
  claimRun(runId: string): Promise<boolean>;
  /** Incrementa el contador y devuelve el valor actual (1 = primer hit). */
  bumpRateLimit(kind: 'submit' | 'read', ipHash: string): Promise<number>;
}

const PREFIX = 'tetris:';
const RUN_TTL_SECONDS = 24 * 60 * 60;
/** INCR + EXPIRE en una sola llamada atómica. */
const RATE_LIMIT_SCRIPT =
  "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return n";

export function leaderboardKey(mode: GameMode): string { return PREFIX + 'lb:' + mode; }
export function entryKey(id: string): string { return PREFIX + 'entry:' + id; }
export function playerKey(id: string): string { return PREFIX + 'player:' + id; }
export function runKey(id: string): string { return PREFIX + 'run:' + id; }
export function rateLimitKey(kind: 'submit' | 'read', ipHash: string): string {
  return PREFIX + 'rl:' + kind + ':' + ipHash;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function hashFrom(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(value)) {
    for (let i = 0; i + 1 < value.length; i += 2) {
      const key = value[i];
      const val = value[i + 1];
      if (typeof key === 'string' && typeof val === 'string') out[key] = val;
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, val] of Object.entries(value)) {
      if (typeof val === 'string') out[key] = val;
    }
  }
  return out;
}

function parseEntry(value: unknown): StoredScoreEntry | null {
  const hash = hashFrom(value);
  const id = hash.id;
  const nickname = hash.nickname;
  const mode = hash.mode;
  const createdAt = hash.createdAt;
  if (!id || !nickname || !createdAt) return null;
  if (mode !== 'classic' && mode !== 'chaos') return null;
  if (Number.isNaN(Date.parse(createdAt))) return null;
  const score = num(hash.score);
  const level = num(hash.level);
  const lines = num(hash.lines);
  const startLevel = num(hash.startLevel);
  if (score === null || level === null || lines === null || startLevel === null) return null;
  const entry: StoredScoreEntry = {
    id,
    nickname,
    mode,
    score,
    level,
    lines,
    startLevel,
    createdAt,
    playerId: hash.playerId ?? ''
  };
  const seed = num(hash.seed);
  if (seed !== null) entry.seed = seed;
  return entry;
}

function hashFields(entry: StoredScoreEntry): (string | number)[] {
  const fields: (string | number)[] = [
    'id', entry.id,
    'nickname', entry.nickname,
    'mode', entry.mode,
    'score', entry.score,
    'level', entry.level,
    'lines', entry.lines,
    'startLevel', entry.startLevel,
    'createdAt', entry.createdAt,
    'playerId', entry.playerId
  ];
  if (entry.seed !== undefined) fields.push('seed', entry.seed);
  return fields;
}

export class RedisLeaderboardStore implements LeaderboardStore {
  private readonly redis: RedisClient;

  constructor(redis: RedisClient) {
    this.redis = redis;
  }

  async save(entry: StoredScoreEntry, maxEntries: number): Promise<SaveResult> {
    const lb = leaderboardKey(entry.mode);
    const bestScoreField = 'best:' + entry.mode + ':score';
    const bestIdField = 'best:' + entry.mode + ':id';

    // Todo en un pipeline ordenado: el ZREVRANK ya ve el ZADD anterior.
    const first = await this.redis.pipeline([
      ['HSET', entryKey(entry.id), ...hashFields(entry)],
      ['ZADD', lb, String(entry.score), entry.id],
      ['ZREVRANK', lb, entry.id],
      ['ZCARD', lb],
      ['HGET', playerKey(entry.playerId), bestScoreField],
      ['HGET', playerKey(entry.playerId), bestIdField]
    ]);

    const rawRank = num(first[2]);
    const rawTotal = num(first[3]) ?? 0;
    const previousBest = num(first[4]) ?? 0;
    const previousBestId = text(first[5]) ?? '';
    const improved = entry.score > previousBest;

    const profileWrites: RedisCommand[] = [
      ['HSET', playerKey(entry.playerId), 'name', entry.nickname]
    ];
    if (improved) {
      profileWrites.push([
        'HSET', playerKey(entry.playerId),
        bestScoreField, String(entry.score),
        bestIdField, entry.id
      ]);
    }
    await this.redis.pipeline(profileWrites);

    // Retención: solo las mejores `maxEntries` por modo; se borran sus hashes.
    if (rawTotal > maxEntries) {
      const staleReply = await this.redis.command<unknown>(['ZRANGE', lb, '0', String(-(maxEntries + 1))]);
      const stale = strList(staleReply);
      if (stale.length > 0) {
        const cleanup: RedisCommand[] = [['ZREM', lb, ...stale]];
        for (const id of stale) cleanup.push(['DEL', entryKey(id)]);
        await this.redis.pipeline(cleanup);
      }
    }

    const ranked = rawRank !== null && rawRank < maxEntries;
    return {
      rank: ranked && rawRank !== null ? rawRank + 1 : null,
      total: Math.min(rawTotal, maxEntries),
      personalBestScore: improved ? entry.score : previousBest,
      personalBestEntryId: improved ? entry.id : previousBestId,
      improved
    };
  }

  async top(mode: GameMode, limit: number): Promise<{ entries: StoredScoreEntry[]; total: number }> {
    const lb = leaderboardKey(mode);
    const head = await this.redis.pipeline([
      ['ZREVRANGE', lb, '0', String(Math.max(0, limit - 1))],
      ['ZCARD', lb]
    ]);
    const ids = strList(head[0]);
    const total = num(head[1]) ?? 0;
    if (ids.length === 0) return { entries: [], total };

    const replies = await this.redis.pipeline(ids.map((id) => ['HGETALL', entryKey(id)]));
    const entries = replies
      .map((reply) => parseEntry(reply))
      .filter((entry): entry is StoredScoreEntry => entry !== null);
    entries.sort(compareScoreEntries);
    return { entries, total };
  }

  async best(playerId: string, mode: GameMode): Promise<{ entry: StoredScoreEntry; rank: number | null } | null> {
    const id = text(await this.redis.command<unknown>([
      'HGET', playerKey(playerId), 'best:' + mode + ':id'
    ]));
    if (!id) return null;
    const entry = parseEntry(await this.redis.command<unknown>(['HGETALL', entryKey(id)]));
    if (!entry) return null;
    const rawRank = num(await this.redis.command<unknown>(['ZREVRANK', leaderboardKey(mode), id]));
    return { entry, rank: rawRank === null ? null : rawRank + 1 };
  }

  async claimRun(runId: string): Promise<boolean> {
    const reply = await this.redis.command<unknown>([
      'SET', runKey(runId), '1', 'NX', 'EX', String(RUN_TTL_SECONDS)
    ]);
    return reply === 'OK';
  }

  async bumpRateLimit(kind: 'submit' | 'read', ipHash: string): Promise<number> {
    const ttl = kind === 'submit' ? 3_600 : 60;
    const reply = await this.redis.command<unknown>([
      'EVAL', RATE_LIMIT_SCRIPT, '1', rateLimitKey(kind, ipHash), String(ttl)
    ]);
    return num(reply) ?? 0;
  }
}

