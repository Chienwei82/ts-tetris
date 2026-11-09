/** Patrones por genero: parametrizan musicPatterns con el perfil. */
import { BARS_PER_CHORD, MASK_DENSITY_MAX, MASK_DENSITY_MIN, STEPS_PER_BAR } from './musicConstants.js';
import type { ArpStep, BarPattern, LayerGates, MaskedStep } from './musicPatterns.js';
import { clamp01, humanizeFor, motifFor, omissionsFor, passingDegree, sectionForBar, voiceLeadChord } from './musicPatterns.js';
import { mulberry32, rngForBar } from './musicRng.js';
import type { GenreId, GenreProfile, GenreTexture } from './genreProfiles.js';
import { DEFAULT_TEXTURE, GENRE_PROFILES } from './genreProfiles.js';
export interface GenreSongProfile { readonly tonicOffset: number; readonly progression: number; readonly groove: number; readonly rotation: number; readonly arpWalk: number; readonly octaveLift: number; readonly registerShift: number; readonly mode: number; readonly motif: ReadonlyArray<number>; }
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
  const registerShift = rng() < 0.33 ? -7 : rng() < 0.45 ? 7 : 0;
  const mode = Math.floor(rng() * 3) % 3;
  return { tonicOffset, progression, groove, rotation, arpWalk: tri, octaveLift: 0.12 + (1 - tri) * 0.28, registerShift, mode, motif: motifFor(seed) };
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
function chordRaw(genre: GenreId, seed: number, bar: number): number[] {
  const profile = GENRE_PROFILES[genre];
  const song = songProfileFor(genre, seed);
  const progression = profile.progressions[song.progression] ?? profile.progressions[0] ?? [0];
  const idx = (Math.floor(bar / BARS_PER_CHORD) + song.rotation) % progression.length;
  const root = progression[idx] ?? 0;
  return [root, root + 2, root + 4];
}
export function textureOf(profile: GenreProfile): GenreTexture { return profile.texture ?? DEFAULT_TEXTURE; }
export function chordForGenreBar(genre: GenreId, seed: number, bar: number): number[] {
  const raw = chordRaw(genre, seed, bar);
  if (bar === 0) return raw;
  return voiceLeadChord(chordRaw(genre, seed, bar - 1), raw);
}
function granularThreshold(step: number, rng: () => number): number {
  const strong = step % 4 === 0; const medium = step % 2 === 0;
  const base = strong ? 0 : medium ? 0.35 : 0.7;
  return Math.min(1, Math.max(0, base + rng() * 0.3));
}
function maskedGranular(steps: ReadonlyArray<number>, rng: () => number): MaskedStep[] {
  return steps.map((s, i) => ({ step: s, threshold: i === 0 ? 0 : granularThreshold(s, rng) }));
}
export function barPatternFor(genre: GenreId, seed: number, bar: number): BarPattern {
  const profile = GENRE_PROFILES[genre];
  const song = songProfileFor(genre, seed);
  const rng = rngForBar((seed >>> 0) ^ hashGenre(genre), bar);
  const chord = chordForGenreBar(genre, seed, bar);
  const g = profile.grooves;
  const gi = song.groove % Math.max(1, g.kick.length);
  const omits = omissionsFor(seed, bar);
  const section = sectionForBar(bar);
  const omitDrums = omits.includes('drums');
  const kickSteps = omitDrums ? [] : (g.kick[gi] ?? []);
  const hatSteps = omitDrums ? [] : (g.hat[gi] ?? []);
  const snareSteps = omitDrums ? [] : (g.snare[gi] ?? []);
  const kick = maskedGranular(kickSteps, rng);
  const hat: MaskedStep[] = maskedGranular(hatSteps, rng);
  const isFillBar = (bar % 16) >= 14 && !omitDrums;
  if (isFillBar) { const fill = g.fill[gi % g.fill.length] ?? []; for (const st of fill) if (!hat.some(h => h.step === st)) hat.push({ step: st, threshold: 0.95 }); }
  const snare = maskedGranular(snareSteps, rng);
  // Bajo con nota de paso diatónica en los pasos no raíz (el grado exacto lo elige el engine).
  const bassSteps = omits.includes('bass') ? [] : (g.bass[gi] ?? []);
  const bass: MaskedStep[] = [];
  for (const [i, st] of bassSteps.entries()) { const target = i === 0 ? (chord[0] ?? 0) : passingDegree(chord[0] ?? 0, chord[1] ?? 0); void target; bass.push({ step: st, threshold: i === 0 ? 0 : granularThreshold(st, rng) }); }
  const swingEnabled = g.swing[gi] ?? false;
  const texture = textureOf(profile);
  const swing = swingEnabled ? Math.max(profile.swingS, texture.swingRatio * 0.08) : profile.swingS * 0;
  const arpeggio: ArpStep[] = [];
  const motif = song.motif.length > 0 ? song.motif : [0, 2, 4, 2];
  for (let step = 0; step < STEPS_PER_BAR; step++) {
    const baseDegree = motif[step % motif.length] ?? 0;
    const modeShift = song.mode === 0 ? 0 : song.mode === 1 ? 2 : -2;
    const transform = section % 4 === 0 ? baseDegree : section % 4 === 1 ? baseDegree + 2 : section % 4 === 2 ? -baseDegree : baseDegree + (step % 3 === 0 ? 7 : 0);
    const tone = chord[step % chord.length] ?? 0;
    const blend = step % 2 === 0 ? transform + modeShift : snapToMelody(profile, tone);
    const strong = step % 2 === 0;
    const threshold = omits.includes('arpeggio') ? 0.98 : strong ? rng() * 0.5 : 0.5 + rng() * 0.5;
    const degree = snapToMelody(profile, blend + song.registerShift);
    const human = humanizeFor(seed, bar, step);
    arpeggio.push({ step, threshold, degree, velocity: Math.min(1, Math.max(0.55, 0.55 + rng() * 0.45 * human.velocity)) });
  }
  return { bar, chord, swing, bass, arpeggio, kick, hat, snare };
}
export function tempoForGenre(profile: GenreProfile, intensity: number): number {
  return profile.bpmMin + (profile.bpmMax - profile.bpmMin) * clamp01(intensity);
}
export function cutoffForGenre(profile: GenreProfile, intensity: number): number {
  return profile.cutoffMinHz + (profile.cutoffMaxHz - profile.cutoffMinHz) * clamp01(intensity);
}
export function layersForGenre(profile: GenreProfile, intensity: number): LayerGates {
  const v = clamp01(intensity);
  return { bass: v >= profile.thresholds.bass, arpeggio: v >= profile.thresholds.arpeggio, drums: v >= profile.thresholds.drums };
}
/** Gates continuos 0..1 con smoothstep alrededor del umbral. */
export function gateRamp(v: number, threshold: number, spread = 0.2): number {
  if (!(threshold <= 1)) return 0;
  const lo = threshold - spread / 2; const hi = threshold + spread / 2;
  if (v <= lo) return 0; if (v >= hi) return 1;
  const t = (v - lo) / (hi - lo); return clamp01(t * t * (3 - 2 * t));
}
export function layersSmoothForGenre(profile: GenreProfile, intensity: number): { bass: number; arpeggio: number; drums: number } {
  const v = clamp01(intensity);
  return { bass: gateRamp(v, profile.thresholds.bass), arpeggio: gateRamp(v, profile.thresholds.arpeggio), drums: profile.thresholds.drums > 1 ? 0 : gateRamp(v, profile.thresholds.drums) };
}
export function maskDensityForGenre(profile: GenreProfile, intensity: number): number {
  const span = 1 - profile.thresholds.arpeggio;
  const t = span > 0 ? clamp01((clamp01(intensity) - profile.thresholds.arpeggio) / span) : 1;
  return MASK_DENSITY_MIN + (MASK_DENSITY_MAX - MASK_DENSITY_MIN) * t;
}
