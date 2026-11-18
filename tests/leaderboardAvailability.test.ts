import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeaderboardError } from '../src/leaderboard/client.js';
import {
  checkLeaderboardAvailability,
  describeLeaderboardError,
  OFFLINE_MESSAGE,
  SERVER_DOWN_MESSAGE,
  SLOW_MESSAGE
} from '../src/leaderboard/availability.js';

afterEach(() => { vi.unstubAllGlobals(); });

describe('disponibilidad del API de puntajes', () => {
  it('distingue red, timeout y servidor caído', () => {
    expect(describeLeaderboardError(new LeaderboardError('x', 'network', 0))).toEqual({ available: false, message: OFFLINE_MESSAGE });
    expect(describeLeaderboardError(new LeaderboardError('x', 'timeout', 0))).toEqual({ available: false, message: SLOW_MESSAGE });
    expect(describeLeaderboardError(new LeaderboardError('x', 'storage_unavailable', 503))).toEqual({ available: false, message: SERVER_DOWN_MESSAGE });
    expect(describeLeaderboardError(new LeaderboardError('x', 'server_error', 404))).toEqual({ available: false, message: SERVER_DOWN_MESSAGE });
    expect(describeLeaderboardError(new LeaderboardError('x', 'server_error', 500))).toEqual({ available: false, message: SERVER_DOWN_MESSAGE });
  });

  it('un rate limit significa que el API sí responde', () => {
    expect(describeLeaderboardError(new LeaderboardError('espera', 'rate_limited', 429)).available).toBe(true);
  });

  it('la sonda marca disponible un 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ mode: 'classic', total: 0, entries: [] }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )));
    const result = await checkLeaderboardAvailability('classic');
    expect(result.available).toBe(true);
  });

  it('la sonda marca caída un 503 de almacenamiento', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'storage_unavailable', message: 'sin base' }),
      { status: 503, headers: { 'content-type': 'application/json' } }
    )));
    const result = await checkLeaderboardAvailability('classic');
    expect(result).toEqual({ available: false, message: SERVER_DOWN_MESSAGE });
  });

  it('la sonda marca caída cuando fetch lanza un TypeError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    const result = await checkLeaderboardAvailability('classic');
    expect(result).toEqual({ available: false, message: OFFLINE_MESSAGE });
  });

  it('un 200 con HTML (fallback estático) no cuenta como disponible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<!doctype html><html><body>app</body></html>',
      { status: 200, headers: { 'content-type': 'text/html' } }
    )));
    const result = await checkLeaderboardAvailability('classic');
    expect(result).toEqual({ available: false, message: SERVER_DOWN_MESSAGE });
  });
});
