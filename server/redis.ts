/**
 * Cliente mínimo de Upstash Redis sobre su API REST (fetch nativo).
 * Mantiene el proyecto sin dependencias de runtime y funciona en Vercel.
 */
export type RedisCommand = readonly (string | number)[];

export interface RedisClient {
  command<T = unknown>(command: RedisCommand): Promise<T>;
  pipeline(commands: readonly RedisCommand[]): Promise<unknown[]>;
}

export interface RedisClientOptions {
  url: string;
  token: string;
  timeoutMs?: number;
}

interface RedisReply {
  result?: unknown;
  error?: string;
}

export class RedisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedisError';
  }
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function isReply(value: unknown): value is RedisReply {
  return typeof value === 'object' && value !== null;
}

function unwrap(reply: unknown): unknown {
  if (!isReply(reply)) throw new RedisError('Respuesta inesperada de Upstash.');
  if (typeof reply.error === 'string') throw new RedisError('Upstash: ' + reply.error);
  return reply.result;
}

export function createRedisClient(options: RedisClientOptions): RedisClient {
  const base = normalizeUrl(options.url);
  const timeoutMs = options.timeoutMs ?? 4_000;

  async function call(path: string, body: unknown): Promise<unknown> {
    const response = await fetch(base + path, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + options.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) throw new RedisError('Upstash HTTP ' + response.status + '.');
    return response.json();
  }

  return {
    async command<T>(command: RedisCommand): Promise<T> {
      const reply = await call('', command);
      return unwrap(reply) as T;
    },

    async pipeline(commands: readonly RedisCommand[]): Promise<unknown[]> {
      if (commands.length === 0) return [];
      const reply = await call('/pipeline', commands);
      if (!Array.isArray(reply)) throw new RedisError('Pipeline inesperado de Upstash.');
      return reply.map(unwrap);
    }
  };
}

/** Lee la configuración del entorno y falla con un mensaje accionable. */
export function redisOptionsFromEnv(): { url: string; token: string } {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new RedisError('Faltan UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.');
  }
  return { url, token };
}
