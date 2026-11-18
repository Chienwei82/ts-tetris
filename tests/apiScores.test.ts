import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import handler from '../api/scores.js';
import { FakeUpstash } from './helpers/fakeUpstash.js';

process.env.UPSTASH_REDIS_REST_URL = 'http://fake-upstash';
process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';

const fake = new FakeUpstash();
vi.stubGlobal('fetch', fake.fetch);

const PLAYER = '11111111-1111-4111-8111-111111111111';

interface Captured {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

async function call(options: {
  method: string;
  query?: Record<string, string>;
  body?: unknown;
  ip?: string;
}): Promise<Captured> {
  const captured: Captured = { status: 0, body: null, headers: {} };
  const request = {
    method: options.method,
    query: options.query ?? {},
    body: options.body,
    headers: { 'x-forwarded-for': options.ip ?? '10.0.0.1' },
    socket: { remoteAddress: options.ip ?? '10.0.0.1' }
  } as unknown as VercelRequest;
  const response = {
    setHeader: (name: string, value: string) => { captured.headers[name] = value; },
    status: (code: number) => { captured.status = code; return response; },
    json: (body: unknown) => { captured.body = body; return response; }
  } as unknown as VercelResponse;
  await handler(request, response);
  return captured;
}

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    runId: randomUUID(),
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

beforeEach(() => fake.reset());

describe('API /api/scores (handler completo)', () => {
  it('guarda una partida y la devuelve en el tablero de su modo', async () => {
    const created = await call({ method: 'POST', body: payload() });
    expect(created.status).toBe(201);
    const createdBody = created.body as { ranked: boolean; rank: number | null; entry: { nickname: string; mode: string } };
    expect(createdBody.ranked).toBe(true);
    expect(createdBody.rank).toBe(1);
    expect(createdBody.entry.nickname).toBe('David');

    const classic = await call({ method: 'GET', query: { mode: 'classic', limit: '10' }, ip: '10.0.0.2' });
    expect(classic.status).toBe(200);
    const classicBody = classic.body as { total: number; entries: Array<{ nickname: string }> };
    expect(classicBody.total).toBe(1);
    expect(classicBody.entries[0]?.nickname).toBe('David');

    const chaos = await call({ method: 'GET', query: { mode: 'chaos' }, ip: '10.0.0.2' });
    const chaosBody = chaos.body as { total: number; entries: unknown[] };
    expect(chaosBody.total).toBe(0);
    expect(chaosBody.entries).toHaveLength(0);
    expect(classic.headers['Cache-Control']).toBe('no-store');
  });

  it('devuelve mi mejor marca con playerId', async () => {
    await call({ method: 'POST', body: payload() });
    const board = await call({ method: 'GET', query: { mode: 'classic', playerId: PLAYER }, ip: '10.0.0.3' });
    const body = board.body as { me?: { rank: number | null } };
    expect(body.me?.rank).toBe(1);
  });

  it('es idempotente por runId', async () => {
    const body = payload();
    const first = await call({ method: 'POST', body });
    expect(first.status).toBe(201);
    const second = await call({ method: 'POST', body });
    expect(second.status).toBe(409);
    expect((second.body as { error: string }).error).toBe('duplicate_run');
  });

  it('valida payloads y modos', async () => {
    const badStart = await call({ method: 'POST', body: payload({ startLevel: 3 }), ip: '10.0.0.4' });
    expect(badStart.status).toBe(400);
    expect((badStart.body as { error: string }).error).toBe('start_level_not_ranked');

    const badMode = await call({ method: 'GET', query: { mode: 'hardcore' }, ip: '10.0.0.4' });
    expect(badMode.status).toBe(400);
    expect((badMode.body as { field: string }).field).toBe('mode');
  });

  it('responde 405 y Allow para métodos no soportados', async () => {
    const response = await call({ method: 'PUT' });
    expect(response.status).toBe(405);
    expect(response.headers.Allow).toBe('GET, POST');
  });

  it('limita los envíos por IP', async () => {
    let last: Captured | null = null;
    for (let i = 0; i < 13; i++) {
      last = await call({ method: 'POST', body: payload(), ip: '10.0.0.9' });
    }
    expect(last?.status).toBe(429);
    expect((last?.body as { error: string }).error).toBe('rate_limited');
  });
});
