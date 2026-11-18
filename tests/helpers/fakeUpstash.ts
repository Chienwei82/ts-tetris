import type { RedisCommand } from '../../server/redis.js';

/**
 * Upstash REST simulado para pruebas del handler: mantiene ZSET, HASH, STRING
 * y responde a `/` (comando suelto) y `/pipeline` (array de comandos).
 */
export class FakeUpstash {
  readonly hashes = new Map<string, Map<string, string>>();
  readonly zsets = new Map<string, Map<string, number>>();
  readonly strings = new Map<string, string>();
  readonly ttls = new Map<string, number>();

  reset(): void {
    this.hashes.clear();
    this.zsets.clear();
    this.strings.clear();
    this.ttls.clear();
  }

  /** Función compatible con `fetch` para inyectar en `vi.stubGlobal`. */
  readonly fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
    const isPipeline = url.endsWith('/pipeline');
    const commands = (isPipeline ? body : [body]) as RedisCommand[];
    const replies = commands.map((command) => {
      const parts = command.map(String);
      try {
        return { result: this.exec(parts[0] ?? '', parts.slice(1)) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    });
    return new Response(JSON.stringify(isPipeline ? replies : replies[0]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  private hash(key: string): Map<string, string> {
    let value = this.hashes.get(key);
    if (!value) { value = new Map(); this.hashes.set(key, value); }
    return value;
  }

  private zset(key: string): Map<string, number> {
    let value = this.zsets.get(key);
    if (!value) { value = new Map(); this.zsets.set(key, value); }
    return value;
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
        for (let i = 0; i + 1 < fields.length; i += 2) hash.set(fields[i] ?? '', fields[i + 1] ?? '');
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
