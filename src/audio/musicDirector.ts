/**
 * MusicDirector: fachada de musica con generos y crossfade cuantizado.
 * - Un motor activo + un motor saliente durante el crossfade (2 compases).
 * - El cambio de genero conserva intensity y elige semilla sin repetir.
 * - Si la musica esta off, el genero se guarda pero no suena hasta reactivar.
 */
import { FADE_OUT_S } from './musicConstants.js';
import { clamp01 } from './musicPatterns.js';
import type { GenreId } from './genreProfiles.js';
import { DEFAULT_GENRE } from './genreProfiles.js';
import { CROSSFADE_BARS } from './genreCrossfader.js';
import { pickSeedRandom } from './genreRegistry.js';
import { tempoForGenre } from './genrePatterns.js';
import { profileOf } from './genreRegistry.js';
import { MusicEngine } from './musicEngine.js';
export interface DirectorOptions { readonly initialGenre?: GenreId; readonly pickSeed?: (genre: GenreId, previous?: number) => number; }
export class MusicDirector {
  private engine: MusicEngine | null = null;
  private outgoing: MusicEngine | null = null;
  private outgoingTimer = 0;
  private enabled = true;
  private unlocked = false;
  private playing = false;
  private paused = false;
  private hidden = false;
  private started = false;
  private intensity = 0;
  private seed = 1;
  private genre: GenreId = DEFAULT_GENRE;
  private readonly chooseSeed: (genre: GenreId, previous?: number) => number;
  private disableTimer = 0;
  constructor(opts: DirectorOptions = {}) {
    this.genre = opts.initialGenre ?? DEFAULT_GENRE;
    this.chooseSeed = opts.pickSeed ?? ((g, prev) => pickSeedRandom(g, prev));
  }
  unlock(): void { this.unlocked = true; this.playIfDesired(); }
  isEnabled(): boolean { return this.enabled; }
  getGenre(): GenreId { return this.genre; }
  getSeed(): number { return this.seed; }
  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    window.clearTimeout(this.disableTimer);
    this.playIfDesired();
  }
  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    window.clearTimeout(this.disableTimer);
    const eng = this.engine;
    if (!eng) return;
    eng.stop(FADE_OUT_S);
    this.disableTimer = window.setTimeout(() => { if (!this.enabled) this.engine?.setHidden(true); }, FADE_OUT_S * 1000 + 100);
  }
  toggle(): void { if (this.enabled) this.disable(); else this.enable(); }
  start(seed: number): void {
    this.seed = seed >>> 0;
    this.playing = true;
    this.paused = false;
    this.started = false;
    this.intensity = 0;
    this.playIfDesired();
  }
  /** Inicia partida eligiendo semilla del genero actual (sin repetir la anterior). */
  startWithGenreSeed(genre?: GenreId): void {
    if (genre !== undefined) this.genre = genre;
    this.seed = this.chooseSeed(this.genre, this.lastSeedByGenre.get(this.genre));
    this.lastSeedByGenre.set(this.genre, this.seed);
    this.start(this.seed);
  }
  stop(): void {
    this.playing = false;
    this.started = false;
    this.clearOutgoing();
    this.engine?.stop(FADE_OUT_S);
  }
  resolveEnding(): void {
    this.playing = false;
    this.started = false;
    this.clearOutgoing();
    this.engine?.resolveEnding();
  }
  setIntensity(value: number): void {
    this.intensity = clamp01(value);
    this.engine?.setIntensity(this.intensity);
  }
  /**
   * Cambio de genero en caliente: crossfade cuantizado al compas.
   * Si esta apagado o no suena, solo guarda el genero + semilla nueva.
   */
  private lastSeedByGenre = new Map<GenreId, number>();
  setGenre(next: GenreId, seed?: number): void {
    const prevGenre = this.genre;
    const prevSeedForGenre = this.lastSeedByGenre.get(next);
    this.genre = next;
    if (seed === undefined) {
      const avoid = prevGenre === next ? this.seed : prevSeedForGenre;
      this.seed = this.chooseSeed(next, avoid);
    } else {
      this.seed = seed >>> 0;
    }
    this.lastSeedByGenre.set(next, this.seed);
    const eng = this.engine;
    if (!this.enabled || !this.unlocked || !this.playing || this.paused || this.hidden || !eng || !this.started) return;
    this.crossfadeTo(next, this.seed);
  }
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) { this.engine?.stop(FADE_OUT_S); this.clearOutgoing(); }
    else this.playIfDesired();
  }
  setHidden(hidden: boolean): void {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    if (hidden) { this.engine?.setHidden(true); this.clearOutgoing(); return; }
    this.engine?.setHidden(false);
    this.playIfDesired();
  }
  dispose(): void {
    window.clearTimeout(this.disableTimer);
    this.clearOutgoing();
    this.engine?.dispose();
    this.engine = null;
    this.playing = false;
    this.started = false;
  }
  private crossfadeTo(next: GenreId, seed: number): void {
    const current = this.engine;
    if (!current) { this.playIfDesired(); return; }
    let incoming: MusicEngine | null = null;
    try { incoming = new MusicEngine(); } catch { return; }
    incoming.setIntensity(this.intensity);
    try { incoming.start(seed, this.intensity, next); } catch { try { incoming.dispose(); } catch { /* ignore */ } return; }
    // El entrante ya suena a volumen pleno; fundimos el saliente y lo liberamos.
    this.outgoing = current;
    this.engine = incoming;
    this.started = true;
    const secs = this.crossfadeSeconds(next);
    current.stop(Math.max(0.3, secs));
    window.clearTimeout(this.outgoingTimer);
    const old = this.outgoing;
    this.outgoingTimer = window.setTimeout(() => {
      try { old?.dispose(); } catch { /* ignore */ }
      if (this.outgoing === old) this.outgoing = null;
    }, Math.max(0.3, secs) * 1000 + 150);
  }
  private crossfadeSeconds(next: GenreId): number {
    const bpm = tempoForGenre(profileOf(next), this.intensity);
    const beat = bpm > 0 ? 60 / bpm : 0.5;
    return beat * 4 * CROSSFADE_BARS;
  }
  private clearOutgoing(): void {
    window.clearTimeout(this.outgoingTimer);
    const old = this.outgoing;
    this.outgoing = null;
    if (old) { try { old.dispose(); } catch { /* ignore */ } }
  }
  private playIfDesired(): void {
    if (!this.enabled || !this.unlocked || !this.playing || this.paused || this.hidden) return;
    const eng = this.ensureEngine();
    if (!eng) return;
    if (this.started) { if (!eng.running) eng.resumePlayback(); }
    else { eng.start(this.seed, this.intensity, this.genre); this.started = true; }
  }
  private ensureEngine(): MusicEngine | null {
    try {
      if (!this.engine) { this.engine = new MusicEngine(); this.engine.setIntensity(this.intensity); }
      return this.engine;
    } catch { return null; }
  }
}
