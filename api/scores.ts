import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { ApiError } from '../server/errors.js';
import { createRedisClient, RedisError, redisOptionsFromEnv } from '../server/redis.js';
import { createScoreService } from '../server/service.js';
import type { ScoreService } from '../server/service.js';
import { RedisLeaderboardStore } from '../server/store.js';

/** Se reutiliza entre invocaciones calientes (misma instancia de la función). */
let cachedService: ScoreService | null = null;

function getService(): ScoreService {
  if (cachedService) return cachedService;
  try {
    const options = redisOptionsFromEnv();
    const redis = createRedisClient(options);
    cachedService = createScoreService({ store: new RedisLeaderboardStore(redis) });
    return cachedService;
  } catch {
    throw new ApiError(503, 'storage_unavailable', 'La clasificación no está configurada en el servidor.');
  }
}

function firstValue(value: string | string[] | undefined): unknown {
  return Array.isArray(value) ? value[0] : value;
}

/** IP hasheada: sirve para el rate limit sin guardar datos personales. */
function clientIpHash(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = (raw ?? '').split(',')[0]?.trim();
  const ip = first !== undefined && first.length > 0 ? first : (req.socket?.remoteAddress ?? 'unknown');
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

function sendError(res: VercelResponse, error: unknown): void {
  if (error instanceof ApiError) {
    res.status(error.status).json(error.toBody());
    return;
  }
  // Un fallo de red/DNS de fetch llega como TypeError; Upstash, como RedisError;
  // un timeout de AbortSignal llega como DOMException "TimeoutError".
  if (error instanceof RedisError || error instanceof TypeError ||
      (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))) {
    console.error('[scoreboard] almacenamiento:', error instanceof Error ? error.message : String(error));
    res.status(503).json({
      error: 'storage_unavailable',
      message: 'La clasificación no está disponible ahora mismo. Inténtalo más tarde.'
    });
    return;
  }
  console.error('[scoreboard] error inesperado:', error);
  res.status(500).json({ error: 'server_error', message: 'Error interno del servidor.' });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const service = getService();
    if (req.method === 'GET') {
      const body = await service.board({
        mode: firstValue(req.query.mode as string | string[] | undefined),
        limit: firstValue(req.query.limit as string | string[] | undefined),
        playerId: firstValue(req.query.playerId as string | string[] | undefined),
        ipHash: clientIpHash(req)
      });
      res.status(200).json(body);
      return;
    }
    if (req.method === 'POST') {
      const payload: unknown = req.body;
      const result = await service.submit({ payload, ipHash: clientIpHash(req) });
      res.status(201).json(result);
      return;
    }
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed', message: 'Método no permitido.' });
  } catch (error) {
    sendError(res, error);
  }
}

export const config = { maxDuration: 10 };
