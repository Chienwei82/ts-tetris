import { describe, expect, it } from 'vitest';
import type { RedisClient, RedisCommand } from '../server/redis.js';
import { RedisLeaderboardStore } from '../server/store.js';
import type { StoredScoreEntry } from '../src/leaderboard/types.js';

/**
 * Redis en memoria con los comandos que usa el almacén. Valida el uso real de
 * ZSET/HASH/SET (orden, purga, idempotencia y contadores) sin red.
 */
class FakeRedis implements RedisClient {
  readonly hashes = new Map<string, Map<string, string>>();
  readonly zsets = new Map<string, Map<string, number>>();
  readonly strings = new Map<string, string>();
  readonly ttls = new Map<string, number>();

  async command<T>(command: RedisCommand): Promise<T> {
    const parts = command.map(String);
    const name = parts[0] ?? '';
    return this.exec(name, parts.slice(1)) as T;
  }

  async pipeline(commands: readonly RedisCommand[]): Promise<unknown[]> {
    const out: unknown[] = [];
    for (const command of commands) out.push(await this.command(command));
    return out;
  }

  private hash(key: string): Map<string, string> {
    let hash = this.hashes.get(key);
    if (!hash) { hash = new Map(); this.hashes.set(key, hash); }
    return hash;
  }

  private zset(key: string): Map<string, number> {
    let set = this.zsets.get(key);
    if (!set) { set = new Map(); this.zsets.set(key, set); }
    return set;
  }

  private order(key: string): string[] {
    return [...this.zset(key)]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([member]) => member);
  }

  private exec(name: string, args: string[]): unknown {
    switch (name) {
      case 'HSET': {
        const [key, ...fields] = args;
        const hash = this.hash(key ?? '');
        for (let i = 0; i + 1 < fields.length; i += 2) {
          hash.set(fields[i] ?? '', fields[i + 1] ?? '');
        }
        return fields.length / 2;
      }
      case 'HGET': return this.hashes.get(args[0] ?? '')?.get(args[1] ?? '') ?? null;
      case 'HGETALL': {
        const hash = this.hashes.get(args[0] ?? '');
        if (!hash || hash.size === 0) return [];
        const out: string[] = [];
        for (const [field, value] of hash) out.push(field, value);
        return out;
      }
      case 'ZADD': {
        this.zset(args[0] ?? '').set(args[2] ?? '', Number(args[1]));
        return 1;
      }
      case 'ZCARD': return this.zsets.get(args[0] ?? '')?.size ?? 0;
      case 'ZREVRANK': {
        const index = this.order(args[0] ?? '').indexOf(args[1] ?? '');
        return index < 0 ? null : index;
      }
      case 'ZREVRANGE': {
        const order = this.order(args[0] ?? '');
        const start = Number(args[1]);
        const stop = Number(args[2]);
        const end = stop < 0 ? order.length + stop + 1 : stop + 1;
        return order.slice(start, Math.max(start, end));
      }
      case 'ZRANGE': {
        const ascending = [...this.order(args[0] ?? '')].reverse();
        const start = Number(args[1]);
        const stop = Number(args[2]);
        const end = stop < 0 ? ascending.length + stop + 1 : stop + 1;
        return ascending.slice(start, Math.max(start, end));
      }
      case 'ZREM': {
        const set = this.zsets.get(args[0] ?? '');
        if (!set) return 0;
        let removed = 0;
        for (const member of args.slice(1)) if (set.delete(member)) removed++;
        return removed;
      }
      case 'DEL': {
        let removed = 0;
        for (const key of args) {
          const found = this.hashes.delete(key) || this.zsets.delete(key) || this.strings.delete(key);
          if (found) removed++;
        }
        return removed;
      }
      case 'SET': {
        const [key, value, ...options] = args;
        if (options.includes('NX') && this.strings.has(key ?? '')) return null;
        this.strings.set(key ?? '', value ?? '');
        return 'OK';
      }
      case 'EXPIRE':
        this.ttls.set(args[0] ?? '', Number(args[1]));
        return 1;
      case 'EVAL': {
        // Único script usado: INCR + EXPIRE en el primer hit.
        const key = args[2] ?? '';
        const next = Number(this.strings.get(key) ?? '0') + 1;
        this.strings.set(key, String(next));
        if (next === 1) this.ttls.set(key, Number(args[3] ?? 0));
        return next;
      }
      default:
        throw new Error('comando no soportado: ' + name);
    }
  }
}

function makeEntry(overrides: Partial<StoredScoreEntry> = {}): StoredScoreEntry {
  return {
    id: 'e1',
    nickname: 'David',
    mode: 'classic',
    score: 100,
    level: 1,
    lines: 0,
    startLevel: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    playerId: 'p1',
    ...overrides
  };
}

describe('almacén Redis de la clasificación', () => {
  it('guarda, ordena y recupera la mejor marca', async () => {
    const redis = new FakeRedis();
    const store = new RedisLeaderboardStore(redis);
    const first = await store.save(makeEntry(), 200);
    expect(first.rank).toBe(1);
    expect(first.total).toBe(1);
    expect(first.improved).toBe(true);

    const second = await store.save(makeEntry({
      id: 'e2', score: 500, createdAt: '2026-01-02T00:00:00.000Z', playerId: 'p2', nickname: 'Otra'
    }), 200);
    expect(second.rank).toBe(1);

    const page = await store.top('classic', 10);
    expect(page.total).toBe(2);
    expect(page.entries.map((entry) => entry.id)).toEqual(['e2', 'e1']);

    const best = await store.best('p2', 'classic');
    expect(best?.rank).toBe(1);
    expect(best?.entry.score).toBe(500);
    expect(redis.zsets.get('tetris:lb:classic')?.size).toBe(2);
  });

  it('mantiene Tradicional y Caos separados', async () => {
    const store = new RedisLeaderboardStore(new FakeRedis());
    await store.save(makeEntry(), 200);
    await store.save(makeEntry({ id: 'e2', mode: 'chaos', score: 900, playerId: 'p2' }), 200);
    const classic = await store.top('classic', 10);
    const chaos = await store.top('chaos', 10);
    expect(classic.entries.map((entry) => entry.id)).toEqual(['e1']);
    expect(chaos.entries.map((entry) => entry.id)).toEqual(['e2']);
  });

  it('purga las entradas fuera del top y borra sus hashes', async () => {
    const store = new RedisLeaderboardStore(new FakeRedis());
    await store.save(makeEntry({ id: 'low', score: 10 }), 2);
    await store.save(makeEntry({ id: 'mid', score: 20 }), 2);
    await store.save(makeEntry({ id: 'high', score: 30 }), 2);
    const page = await store.top('classic', 10);
    expect(page.total).toBe(2);
    expect(page.entries.map((entry) => entry.id)).toEqual(['high', 'mid']);
  });

  it('no mejora la marca personal con una partida peor', async () => {
    const store = new RedisLeaderboardStore(new FakeRedis());
    await store.save(makeEntry({ id: 'e1', score: 500 }), 200);
    const worse = await store.save(makeEntry({ id: 'e2', score: 100 }), 200);
    expect(worse.improved).toBe(false);
    expect(worse.personalBestScore).toBe(500);
    expect(worse.personalBestEntryId).toBe('e1');
    // El hash del perfil conserva la mejor marca.
    expect((await store.best('p1', 'classic'))?.entry.score).toBe(500);
  });

  it('reclama cada runId una sola vez', async () => {
    const store = new RedisLeaderboardStore(new FakeRedis());
    expect(await store.claimRun('run-1')).toBe(true);
    expect(await store.claimRun('run-1')).toBe(false);
    expect(await store.claimRun('run-2')).toBe(true);
  });

  it('incrementa contadores de rate limit con TTL en el primer hit', async () => {
    const redis = new FakeRedis();
    const store = new RedisLeaderboardStore(redis);
    expect(await store.bumpRateLimit('read', 'iphash')).toBe(1);
    expect(await store.bumpRateLimit('read', 'iphash')).toBe(2);
    expect(redis.ttls.get('tetris:rl:read:iphash')).toBe(60);
    expect(await store.bumpRateLimit('submit', 'iphash')).toBe(1);
    expect(redis.ttls.get('tetris:rl:submit:iphash')).toBe(3600);
  });
});

