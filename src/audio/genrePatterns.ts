/** Patrones por genero: parametrizan musicPatterns con el perfil. */
import { BARS_PER_CHORD, MASK_DENSITY_MAX, MASK_DENSITY_MIN, STEPS_PER_BAR } from './musicConstants.js';
import type { ArpStep, BarPattern, MaskedStep } from './musicPatterns.js';
import { clamp01 } from './musicPatterns.js';
import { mulberry32, rngForBar } from './musicRng.js';
import type { GenreId, GenreProfile } from './genreProfiles.js';
import { GENRE_PROFILES } from './genreProfiles.js';
export interface GenreSongProfile { readonly tonicOffset: number; readonly progression: number; readonly groove: number; readonly rotation: number; readonly arpWalk: number; readonly octaveLift: number; }
export function hashGenre(genre: GenreId): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < genre.length; i++) { h ^= genre.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export function songProfileFor(genre: GenreId, seed: number): GenreSongProfile {
  const profile = GENRE_PROFILES[genre];
  const rng = mulberry32((seed >>> 0) ^ hashGenre(genre));
  const tonicOffset = Math.floor(rng() * 12);
  const nProg = Math.max(1, profile.progressions.length);
  const nGroove = Math.max(1, profile.grooves.kick.length);
  const progression = Math.floor(rng() * nProg) % nProg;
  const groove = Math.floor(rng() * nGroove) % nGroove;
  const rotation = Math.floor(rng() * 4) % 4;
  const sum = rng() + rng() + rng();
  const tri = sum > 1.2 ? 1 - sum / 3 : sum / 3;
  return { tonicOffset, progression, groove, rotation, arpWalk: tri, octaveLift: 0.12 + (1 - tri) * 0.28 };
}
export function rootHzFor(profile: GenreProfile, tonicOffset: number): number {
  return profile.rootBaseHz * Math.pow(2, tonicOffset / 12);
}
export function freqForGenreDegree(profile: GenreProfile, tonicOffset: number, degree: number): number {
  const count = profile.scaleIntervals.length;
  const idx = ((degree % count) + count) % count;
  const octaves = Math.floor(degree / count);
  const interval = profile.scaleIntervals[idx] ?? 0;
  return rootHzFor(profile, tonicOffset) * Math.pow(2, (interval + 12 * octaves) / 12);
}
function snapToMelody(profile: GenreProfile, degree: number): number {
  const count = profile.scaleIntervals.length;
  const base = Math.floor(degree / count) * count;
  const idx = ((degree % count) + count) % count;
  let best = profile.melodyDegrees[0] ?? 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const m of profile.melodyDegrees) { const d = Math.abs(m - idx); if (d < bestDist) { bestDist = d; best = m; } }
  return base + best;
}
export function chordForGenreBar(genre: GenreId, seed: number, bar: number): number[] {
  const profile = GENRE_PROFILES[genre];
  const song = songProfileFor(genre, seed);
  const progression = profile.progressions[song.progression] ?? profile.progressions[0] ?? [0];
  const idx = (Math.floor(bar / BARS_PER_CHORD) + song.rotation) % progression.length;
  const root = progression[idx] ?? 0;
  return [root, root + 2, root + 4];
}
const MASK_STEPS = [0.5, 0.7, 0.9] as const;
function maskedGenre(steps: ReadonlyArray<number>): MaskedStep[] {
  return steps.map((s, i) => ({ step: s, threshold: i === 0 ? 0 : (MASK_STEPS[(i - 1) % MASK_STEPS.length] ?? 0.9) }));
}
export function barPatternFor(genre: GenreId, seed: number, bar: number): BarPattern {
  const profile = GENRE_PROFILES[genre];
  const song = songProfileFor(genre, seed);
  const rng = rngForBar((seed >>> 0) ^ hashGenre(genre), bar);
  const chord = chordForGenreBar(genre, seed, bar);
  const g = profile.grooves;
  const gi = song.groove % Math.max(1, g.kick.length);
  const kick = maskedGenre(g.kick[gi] ?? []);
  const rawHat = maskedGenre(g.hat[gi] ?? []);
  const hat = [...rawHat];
  const snare = maskedGenre(g.snare[gi] ?? []);
  const bass = maskedGenre(g.bass[gi] ?? []);
  const swing = (g.swing[gi] ?? false) ? profile.swingS : 0;
  const arpeggio: ArpStep[] = [];
  let toneIndex = Math.floor(rng() * chord.length);
  let octave = 0;
  for (let step = 0; step < STEPS_PER_BAR; step++) {
    const walk = song.arpWalk - 0.5;
    const jump = walk === 0 ? 1 : (walk > 0 ? 1 : 2) + (rng() < Math.abs(walk) ? 1 : 0);
    toneIndex = (((toneIndex + (walk >= 0 ? jump : -jump)) % chord.length) + chord.length) % chord.length;
    if (rng() < song.octaveLift * 0.4) octave = octave === 0 ? 7 : 0;
    const tone = chord[toneIndex] ?? 0;
    const onBeat = step % 2 === 0;
    const threshold = onBeat ? rng() * 0.55 : 0.55 + rng() * 0.45;
    arpeggio.push({ step, threshold, degree: snapToMelody(profile, tone + octave), velocity: 0.55 + rng() * 0.45 });
  }
  return { bar, chord, swing, bass, arpeggio, kick, hat, snare };
}
export function tempoForGenre(profile: GenreProfile, intensity: number): number {
  return profile.bpmMin + (profile.bpmMax - profile.bpmMin) * clamp01(intensity);
}
export function cutoffForGenre(profile: GenreProfile, intensity: number): number {
  return profile.cutoffMinHz + (profile.cutoffMaxHz - profile.cutoffMinHz) * clamp01(intensity);
}
export function layersForGenre(profile: GenreProfile, intensity: number): { bass: boolean; arpeggio: boolean; drums: boolean } {
  const v = clamp01(intensity);
  return { bass: v >= profile.thresholds.bass, arpeggio: v >= profile.thresholds.arpeggio, drums: v >= profile.thresholds.drums };
}
export function maskDensityForGenre(profile: GenreProfile, intensity: number): number {
  const span = 1 - profile.thresholds.arpeggio;
  const t = span > 0 ? clamp01((clamp01(intensity) - profile.thresholds.arpeggio) / span) : 1;
  return MASK_DENSITY_MIN + (MASK_DENSITY_MAX - MASK_DENSITY_MIN) * t;
}
