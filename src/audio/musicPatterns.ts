/**
 * Generación de patrones musicales: TODO el material deriva de (semilla, compás)
 * y de la escala — nunca hay notas fuera de ella. La intensidad solo hace de
 * puerta/máscara (qué capas suenan y cuán densas), nunca cambia las notas:
 * misma semilla ⇒ misma canción, pase lo que pase en la partida.
 */
import {
  BARS_PER_CHORD, BEATS_PER_BAR, BPM_MAX, BPM_MIN,
  CHORD_PROGRESSIONS, CHORD_ROOT_DEGREES, CUTOFF_MAX_HZ, CUTOFF_MIN_HZ,
  CURATED_SONG_SEEDS, GROOVE_BASS_STEPS, GROOVE_HAT_STEPS, GROOVE_KICK_STEPS, GROOVE_SWING,
  HIGH_DENSITY, MASK_DENSITY_MAX, MASK_DENSITY_MIN, MAX_REPEAT, MELODY_DEGREES,
  MIN_DEGREES, MOTION_TARGET, MOTION_WEIGHT, REPEAT_WEIGHT, ROOT_FREQ,
  SCALE_INTERVALS, SONG_BARS, STEPS_PER_BAR, SWING_S,
  THRESHOLD_ARPEGIO, THRESHOLD_BASS, THRESHOLD_DRUMS, VARIETY_WEIGHT,
} from './musicConstants.js';
import { mulberry32, rngForBar } from './musicRng.js';

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
  /** Swing de este compás: desplaza los pasos débiles (segundos). */
  swing: number;
  bass: MaskedStep[];
  arpeggio: ArpStep[];
  kick: MaskedStep[];
  hat: MaskedStep[];
}

/** Canción elegida por semilla: misma semilla ⇒ misma canción siempre. */
export interface SongProfile {
  /** Índice de progresión de acordes (3 posibles). */
  progression: number;
  /** Índice de groove rítmico (6 posibles). */
  groove: number;
  /** Rotación del ciclo de acordes (0..3): qué acorde abre la canción. */
  rotation: number;
  /** Sesgo de saltos del arpegio (0..1): dirección y tamaño del recorrido. */
  arpWalk: number;
  /** Rebote de octavas del arpegio (0..1): probabilidad y registro. */
  octaveLift: number;
}

/** Deriva el perfil de canción de una semilla de forma determinista. */
export function songProfile(seed: number): SongProfile {
  const rng = mulberry32(seed >>> 0);
  const sum = rng() + rng() + rng();
  // 3 progresiones × 6 grooves × 4 rotaciones = 72 combinaciones posibles.
  const combo = Math.floor(rng() * 72);
  const progression = Math.floor(combo / 24);
  const groove = Math.floor((combo % 24) / 4);
  const rotation = combo % 4;
  // Distribución triangular de [0,1]: evita extremos fríos o excesivos.
  const arpWalk = sum > 1.2 ? 1 - sum / 3 : sum / 3;
  const octaveLift = 0.12 + (1 - (sum > 1.2 ? 1 - sum / 3 : sum / 3)) * 0.28;
  return { progression, groove, rotation, arpWalk, octaveLift };
}

/**
 * Acorde del compás según la canción: progresión elegida por semilla, rotada
 * para que la canción abra en otro punto del ciclo. Las tríadas son siempre
 * diatónicas, así que cualquier semilla suena consonante.
 */
export function chordForBar(seed: number, bar: number): number[] {
  const profile = songProfile(seed);
  const progression = CHORD_PROGRESSIONS[profile.progression] ?? CHORD_ROOT_DEGREES;
  const chordIndex = (Math.floor(bar / BARS_PER_CHORD) + profile.rotation) % progression.length;
  const root = progression[chordIndex] ?? 0;
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
  const profile = songProfile(seed);
  const rng = rngForBar(seed, bar);
  const chord = chordForBar(seed, bar);
  const kickSteps = GROOVE_KICK_STEPS[profile.groove] ?? [0, 8];
  const hatSteps = GROOVE_HAT_STEPS[profile.groove] ?? [2, 6, 10, 14];
  const bassSteps = GROOVE_BASS_STEPS[profile.groove] ?? [0];
  const swingEnabled = GROOVE_SWING[profile.groove] ?? false;
  const swing = swingEnabled ? SWING_S : 0;
  const maskThresholds = [0.5, 0.7, 0.9];
  const masked = (steps: readonly number[]): MaskedStep[] =>
    steps.map((s, i) => ({
      step: s,
      threshold: i === 0 ? 0 : (maskThresholds[(i - 1) % maskThresholds.length] ?? 0.9)
    }));
  const bass = masked(bassSteps);
  const kick = masked(kickSteps);
  const hat = masked(hatSteps);
  const arpeggio: ArpStep[] = [];
  let toneIndex = Math.floor(rng() * chord.length);
  let octave = 0;
  for (let step = 0; step < STEPS_PER_BAR; step++) {
    // Paseo diatónico por el acorde: la semilla decide dirección y saltos.
    const walk = profile.arpWalk - 0.5;
    const jump = walk === 0 ? 1 : (walk > 0 ? 1 : 2) + (rng() < Math.abs(walk) ? 1 : 0);
    toneIndex = (((toneIndex + (walk >= 0 ? jump : -jump)) % chord.length) + chord.length) % chord.length;
    if (rng() < profile.octaveLift * 0.4) octave = octave === 0 ? 7 : 0;
    const tone = chord[toneIndex] ?? 0;
    // Los pasos fuertes son candidatos baratos; los débiles, ocasionales.
    const onBeat = step % 2 === 0;
    const threshold = onBeat ? rng() * 0.55 : 0.55 + rng() * 0.45;
    arpeggio.push({
      step,
      threshold,
      degree: snapToPentatonic(tone + octave),
      velocity: 0.55 + rng() * 0.45
    });
  }
  return { bar, chord, swing, bass, arpeggio, kick, hat };
}

/**
 * Puntuación de calidad de una canción (0..100, mayor es mejor) para elegir
 * las semillas curadas. Recompensa variedad melódica, rango dinámico y
 * movimiento de bajo; penaliza melodías repetitivas o congeladas.
 */
export function songScore(seed: number, bars = SONG_BARS): number {
  const degrees = new Set<number>();
  let stepCount = 0;
  let repeatStreak = 0;
  let maxRepeatStreak = 0;
  let prev = -1;
  let bassMotion = 0;
  for (let bar = 0; bar < bars; bar++) {
    const pattern = barPattern(seed, bar);
    for (const step of pattern.arpeggio) {
      if (step.threshold >= HIGH_DENSITY) continue;
      degrees.add(step.degree % SCALE_INTERVALS.length);
      stepCount += 1;
      if (step.degree === prev) {
        repeatStreak += 1;
        maxRepeatStreak = Math.max(maxRepeatStreak, repeatStreak);
      } else {
        repeatStreak = 0;
      }
      prev = step.degree;
    }
    for (let i = 1; i < pattern.arpeggio.length; i++) {
      const a = pattern.arpeggio[i - 1];
      const b = pattern.arpeggio[i];
      if (a && b && b.threshold < HIGH_DENSITY) {
        bassMotion += Math.min(4, Math.abs((b.degree ?? 0) - (a.degree ?? 0)) / 2);
      }
    }
  }
  const variety = Math.min(1, degrees.size / MIN_DEGREES);
  const motion = Math.min(1, bassMotion / (stepCount * MOTION_TARGET));
  const repeat = maxRepeatStreak >= MAX_REPEAT ? 0 : 1 - maxRepeatStreak / (MAX_REPEAT + 1);
  return Math.round((variety * VARIETY_WEIGHT + motion * MOTION_WEIGHT + repeat * REPEAT_WEIGHT) * 100);
}

/**
 * Elige una semilla de la lista curada a partir de un entero arbitrario
 * (p. ej. la hora actual): cada partida suena con una canción de calidad
 * conocida y, al loguearse la semilla, se puede reproducir con `music.start()`.
 */
export function pickCuratedSeed(value: number): number {
  const idx = CURATED_SONG_SEEDS.length > 0 ? (value >>> 0) % CURATED_SONG_SEEDS.length : 0;
  return CURATED_SONG_SEEDS[idx] ?? CURATED_SONG_SEEDS[0] ?? 1;
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