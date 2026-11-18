import { sanitizeNickname } from './rules.js';

/**
 * Identidad anónima del jugador en el navegador. No hay cuentas ni cookies:
 * solo un UUID y un apodo guardados en `localStorage`.
 */
const PLAYER_ID_KEY = 'tetris-3d:player-id';
const PLAYER_NAME_KEY = 'tetris-3d:player-name';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * UUID v4 con fallback para contextos no seguros (jugar en LAN por http, donde
 * `crypto.randomUUID` no existe). `getRandomValues` sí está disponible ahí.
 */
export function randomUuid(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const b6 = bytes[6] ?? 0;
  const b8 = bytes[8] ?? 0;
  bytes[6] = (b6 & 0x0f) | 0x40;
  bytes[8] = (b8 & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}

/** Devuelve el UUID guardado o crea uno nuevo (y lo persiste si se puede). */
export function ensurePlayerId(): string {
  try {
    const saved = window.localStorage.getItem(PLAYER_ID_KEY);
    if (saved && UUID_RE.test(saved)) return saved;
  } catch { /* almacenamiento no disponible (modo privado) */ }
  const id = randomUuid();
  try { window.localStorage.setItem(PLAYER_ID_KEY, id); } catch { /* ignore */ }
  return id;
}

/** Apodo recordado entre partidas (vacío si nunca se guardó). */
export function loadPlayerName(): string {
  try {
    const saved = window.localStorage.getItem(PLAYER_NAME_KEY);
    return saved ? sanitizeNickname(saved) : '';
  } catch {
    return '';
  }
}

export function savePlayerName(name: string): void {
  try { window.localStorage.setItem(PLAYER_NAME_KEY, sanitizeNickname(name)); } catch { /* ignore */ }
}
