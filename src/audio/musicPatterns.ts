/**
 * Generación de patrones musicales: TODO el material deriva de (semilla, compás)
 * y de la escala — nunca hay notas fuera de ella. La intensidad solo hace de
 * puerta/máscara (qué capas suenan y cuán densas), nunca cambia las notas:
 * misma semilla ⇒ misma canción, pase lo que pase en la partida.
 */
import {
  BARS_PER_CHORD, BEATS_PER_BAR, BPM_MAX, BPM_MIN,
  CHORD_ROOT_DEGREES, CUTOFF_MAX_HZ, CUTOFF_MIN_HZ, MASK_DENSITY_MAX, MASK_DENSITY_MIN,
  MELODY_DEGREES, ROOT_FREQ, SCALE_INTERVALS, STEPS_PER_BAR,
  THRESHOLD_ARPEGIO, THRESHOLD_BASS, THRESHOLD_DRUMS,
} from './musicConstants.js';
import { rngForBar } from './musicRng.js';

/** Limita un valor al rango 0..1. */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Frecuencia (Hz) de un grado de escala; >= 7 sube octavas. */
export function freqForDegree(degree: number): number {
  const count = SCALE_INTERVALS.length;
  const idx = ((degree % count) + count) % count;
  const octaves = Math.floor(degree / count);
  const interval = SCALE_INTERVALS[idx] ?? 0;
  return ROOT_FREQ * Math.pow(2, (interval + 12 * octaves) / 12);
}

/** Paso candidato: suena solo si `threshold` < densidad actual de la capa. */
export interface MaskedStep {
  step: number;       // 0..STEPS_PER_BAR-1
  threshold: number;  // 0..1, fijo por (semilla, compás)
}

export interface ArpStep extends MaskedStep {
  degree: number;     // índice de escala (>= 7 = octava superior)
  velocity: number;   // 0..1
}

export interface BarPattern {
  bar: number;
  /** Grados de escala del acorde (raíz, 3.ª y 5.ª diatónicas). */
  chord: number[];
  bass: MaskedStep[];
  arpeggio: ArpStep[];
  kick: MaskedStep[];
  hat: MaskedStep[];
}

/** Acorde del compás según la progresión lenta (2 compases por acorde). */
export function chordForBar(bar: number): number[] {
  const cycle = Math.floor(bar / BARS_PER_CHORD) % CHORD_ROOT_DEGREES.length;
  const root = CHORD_ROOT_DEGREES[cycle] ?? 0;
  return [root, root + 2, root + 4];
}

/** Acota un grado de escala al subconjunto pentatónico más cercano. */
function snapToPentatonic(degree: number): number {
  const count = SCALE_INTERVALS.length;
  const base = Math.floor(degree / count) * count;
  const idx = ((degree % count) + count) % count;
  let best: number = MELODY_DEGREES[0] ?? 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const m of MELODY_DEGREES) {
    const d = Math.abs(m - idx);
    if (d < bestDist) { bestDist = d; best = m; }
  }
  return base + best;
}

/**
 * Material completo de un compás: siempre idéntico para una misma
 * (semilla, compás). La densidad/intensidad solo decide qué pasos suenan.
 */
export function barPattern(seed: number, bar: number): BarPattern {
  const rng = rngForBar(seed, bar);
  const chord = chordForBar(bar);
  const bass: MaskedStep[] = [
    { step: 0, threshold: 0 },
    { step: 8, threshold: 0.55 },
    { step: 12, threshold: 0.85 }
  ];
  const kick: MaskedStep[] = [
    { step: 0, threshold: 0 },
    { step: 8, threshold: 0.45 },
    { step: 11, threshold: 0.8 }
  ];
  const hat: MaskedStep[] = [
    { step: 2, threshold: 0 }, { step: 6, threshold: 0 },
    { step: 10, threshold: 0 }, { step: 14, threshold: 0 },
    { step: 4, threshold: 0.55 }, { step: 12, threshold: 0.55 }
  ];
  const arpeggio: ArpStep[] = [];
  for (let step = 0; step < STEPS_PER_BAR; step++) {
    // Los pasos fuertes son candidatos baratos; los débiles, ocasionales.
    const onBeat = step % 2 === 0;
    const threshold = onBeat ? rng() * 0.55 : 0.55 + rng() * 0.45;
    const tone = chord[(step + bar) % chord.length] ?? 0;
    const octave = rng() < 0.22 ? 7 : 0; // 7 grados de escala = 1 octava
    arpeggio.push({
      step,
      threshold,
      degree: snapToPentatonic(tone + octave),
      velocity: 0.55 + rng() * 0.45
    });
  }
  return { bar, chord, bass, arpeggio, kick, hat };
}

/** Capas activas según intensidad (pad siempre presente). */
export interface LayerGates {
  bass: boolean;
  arpeggio: boolean;
  drums: boolean;
}

export function layersForIntensity(intensity: number): LayerGates {
  const v = clamp01(intensity);
  return {
    bass: v >= THRESHOLD_BASS,
    arpeggio: v >= THRESHOLD_ARPEGIO,
    drums: v >= THRESHOLD_DRUMS
  };
}

/** Tempo lineal 70→100 BPM con la intensidad. */
export function tempoFor(intensity: number): number {
  return BPM_MIN + (BPM_MAX - BPM_MIN) * clamp01(intensity);
}

/** Frecuencia de corte del filtro global (brillo) según intensidad. */
export function cutoffFor(intensity: number): number {
  return CUTOFF_MIN_HZ + (CUTOFF_MAX_HZ - CUTOFF_MIN_HZ) * clamp01(intensity);
}

/** Densidad de la máscara de notas (0.25 → 1) a partir del umbral del arpegio. */
export function maskDensityFor(intensity: number): number {
  const span = 1 - THRESHOLD_ARPEGIO;
  const t = span > 0 ? clamp01((clamp01(intensity) - THRESHOLD_ARPEGIO) / span) : 1;
  return MASK_DENSITY_MIN + (MASK_DENSITY_MAX - MASK_DENSITY_MIN) * t;
}

/** Duración de un tiempo (segundos) para un tempo dado. */
export function beatDurationSec(bpm: number): number {
  return 60 / (bpm > 0 ? bpm : BPM_MIN);
}

/** Semis por tiempo: la rejilla del scheduler es la semicorchea. */
export const STEPS_PER_BEAT = STEPS_PER_BAR / BEATS_PER_BAR;