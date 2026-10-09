const STORAGE_KEY = 'tetris-3d:fx';
const MODE_KEY = 'tetris-3d:controls';
const MUSIC_KEY = 'tetris-3d:music';

/** Modo de control elegido por el usuario: teclado/ratón o táctil. */
export type ControlMode = 'desktop' | 'touch';

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Stored background-effects preference; defaults to off when the OS asks for reduced motion. */
export function loadEffectsEnabled(): boolean {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch { /* storage unavailable (private mode) */ }
  return !prefersReducedMotion();
}

export function saveEffectsEnabled(on: boolean): void {
  try { window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

/** Elección de controles guardada; `null` si el usuario nunca eligió. */
export function loadControlMode(): ControlMode | null {
  try {
    const v = window.localStorage.getItem(MODE_KEY);
    if (v === 'desktop' || v === 'touch') return v;
  } catch { /* storage unavailable (private mode) */ }
  return null;
}

export function saveControlMode(mode: ControlMode): void {
  try { window.localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
}

/** Preferencia de música procedural; por defecto activada. */
export function loadMusicEnabled(): boolean {
  try {
    const v = window.localStorage.getItem(MUSIC_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch { /* storage unavailable (private mode) */ }
  return true;
}

export function saveMusicEnabled(on: boolean): void {
  try { window.localStorage.setItem(MUSIC_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

import type { GenreId } from '../audio/genreProfiles.js';
const GENRE_KEY = 'tetris-3d:music-genre';
/** Genero musical elegido; por defecto Electronic. */
export type MusicGenre = GenreId;
export function loadMusicGenre(): MusicGenre {
  try {
    const v = window.localStorage.getItem(GENRE_KEY);
    if (v === 'electronic' || v === 'pop' || v === 'techno' || v === 'dance' || v === 'classic') return v;
  } catch { /* storage unavailable (private mode) */ }
  return 'electronic';
}
export function saveMusicGenre(genre: MusicGenre): void {
  try { window.localStorage.setItem(GENRE_KEY, genre); } catch { /* ignore */ }
}

const GAME_MODE_KEY = 'tetris-3d:game-mode';
import type { GameMode } from '../game/types.js';
/** Modo de juego elegido; por defecto clasico. */
export function loadGameMode(): GameMode {
  try {
    const v = window.localStorage.getItem(GAME_MODE_KEY);
    if (v === 'chaos') return 'chaos';
  } catch { /* storage unavailable */ }
  return 'classic';
}
export function saveGameMode(mode: GameMode): void {
  try { window.localStorage.setItem(GAME_MODE_KEY, mode); } catch { /* ignore */ }
}
