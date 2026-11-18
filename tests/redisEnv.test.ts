import { afterEach, describe, expect, it, vi } from 'vitest';
import { RedisError, redisOptionsFromEnv } from '../server/redis.js';

/** Deja el entorno sin configuración de Redis antes de cada caso. */
function clearEnv(): void {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
  vi.stubEnv('KV_REST_API_URL', '');
  vi.stubEnv('KV_REST_API_TOKEN', '');
  vi.stubEnv('KV_REST_API_READ_ONLY_TOKEN', '');
}

afterEach(() => { vi.unstubAllEnvs(); });

describe('redisOptionsFromEnv', () => {
  it('prefiere los nombres propios de Upstash', () => {
    clearEnv();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://upstash.example');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token-upstash');
    vi.stubEnv('KV_REST_API_URL', 'https://kv.example');
    vi.stubEnv('KV_REST_API_TOKEN', 'token-kv');

    expect(redisOptionsFromEnv()).toEqual({
      url: 'https://upstash.example',
      token: 'token-upstash'
    });
  });

  it('acepta los nombres que inyecta la integración de Vercel KV', () => {
    clearEnv();
    vi.stubEnv('KV_REST_API_URL', 'https://kv.example');
    vi.stubEnv('KV_REST_API_TOKEN', 'token-kv');

    expect(redisOptionsFromEnv()).toEqual({ url: 'https://kv.example', token: 'token-kv' });
  });

  it('no acepta el token de solo lectura, que no puede guardar', () => {
    clearEnv();
    vi.stubEnv('KV_REST_API_URL', 'https://kv.example');
    vi.stubEnv('KV_REST_API_READ_ONLY_TOKEN', 'token-read-only');

    expect(() => redisOptionsFromEnv()).toThrow(RedisError);
  });

  it('explica qué variables faltan cuando no hay configuración', () => {
    clearEnv();

    expect(() => redisOptionsFromEnv()).toThrow(/UPSTASH_REDIS_REST_URL/);
  });
});
