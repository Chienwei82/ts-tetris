/**
 * Perfiles de genero: DATOS inmutables, nunca ramas de codigo.
 * Anadir un genero nuevo = anadir una entrada + sus 10 semillas.
 * El motor solo lee estos datos; no hay switch por genero.
 */
export type GenreId = 'electronic' | 'pop' | 'techno' | 'dance' | 'classic';
export const GENRE_IDS = ['electronic', 'pop', 'techno', 'dance', 'classic'] as const;
export const DEFAULT_GENRE: GenreId = 'electronic';
export const GENRE_META: Record<GenreId, { label: string; icon: string }> = {
  electronic: { label: 'Electronic', icon: '🎛️' },
  pop: { label: 'Pop', icon: '🎤' },
  techno: { label: 'Techno', icon: '🤖' },
  dance: { label: 'Dance', icon: '🪩' },
  classic: { label: 'Classic', icon: '🎻' },
};
export interface LayerTimbre { readonly wave: OscillatorType; readonly attackS: number; readonly releaseS: number; readonly detuneCents: number; readonly level: number; }
export interface DrumLevels { readonly kick: number; readonly hat: number; readonly snare: number; readonly hatHpHz: number; }
export interface GenreThresholds { readonly bass: number; readonly arpeggio: number; readonly drums: number; }
export interface GenreGrooves { readonly kick: ReadonlyArray<ReadonlyArray<number>>; readonly hat: ReadonlyArray<ReadonlyArray<number>>; readonly bass: ReadonlyArray<ReadonlyArray<number>>; readonly snare: ReadonlyArray<ReadonlyArray<number>>; readonly swing: ReadonlyArray<boolean>; }
export interface GenreProfile {
  readonly id: GenreId; readonly bpmMin: number; readonly bpmMax: number; readonly rootBaseHz: number;
  readonly scaleIntervals: ReadonlyArray<number>; readonly melodyDegrees: ReadonlyArray<number>;
  readonly progressions: ReadonlyArray<ReadonlyArray<number>>; readonly grooves: GenreGrooves;
  readonly swingS: number; readonly thresholds: GenreThresholds;
  readonly cutoffMinHz: number; readonly cutoffMaxHz: number;
  readonly gains: { readonly pad: number; readonly bass: number; readonly arp: number; readonly drums: number };
  readonly timbre: { readonly pad: LayerTimbre; readonly bass: LayerTimbre; readonly arp: LayerTimbre; readonly drums: DrumLevels };
  readonly seeds: ReadonlyArray<number>; readonly description: string;
}
export const ELECTRONIC_SEEDS = [11, 16, 18, 37, 58, 71, 81, 208, 251, 325] as const;
export const POP_SEEDS = [5, 27, 49, 73, 101, 133, 167, 199, 233, 271] as const;
export const TECHNO_SEEDS = [7, 29, 53, 91, 119, 151, 187, 223, 257, 293] as const;
export const DANCE_SEEDS = [9, 33, 61, 97, 127, 163, 197, 229, 263, 301] as const;
export const CLASSIC_SEEDS = [13, 41, 67, 103, 139, 173, 211, 241, 277, 311] as const;
export function isGenreId(value: unknown): value is GenreId {
  return value === 'electronic' || value === 'pop' || value === 'techno' || value === 'dance' || value === 'classic';
}
const ELECTRONIC_PROFILE = { id: 'electronic', bpmMin: 70, bpmMax: 100, rootBaseHz: 110, scaleIntervals: [0, 2, 3, 5, 7, 9, 10], melodyDegrees: [0, 2, 3, 4, 6], progressions: [[0, 3, 6, 2], [0, 6, 3, 4], [2, 6, 3, 0]], grooves: { kick: [[0, 8], [0, 4, 8, 12], [0, 7, 11], [0], [0, 8], [0]], hat: [[2, 6, 10, 14], [2, 6, 10, 14, 4, 12], [2, 6, 10, 14], [6, 14], [2, 4, 6, 10, 12, 14], [4, 12]], bass: [[0], [0, 8], [0, 10], [0], [0, 8], [0, 8]], snare: [[], [12], [4], [], [4, 12], []], swing: [false, false, true, false, true, false] }, swingS: 0.04, thresholds: { bass: 0.2, arpeggio: 0.4, drums: 0.6 }, cutoffMinHz: 600, cutoffMaxHz: 3800, gains: { pad: 0.16, bass: 0.22, arp: 0.12, drums: 0.18 }, timbre: { pad: { wave: 'sine', attackS: 1.6, releaseS: 2.5, detuneCents: 7, level: 1 }, bass: { wave: 'triangle', attackS: 0.03, releaseS: 0.2, detuneCents: 0, level: 0.9 }, arp: { wave: 'triangle', attackS: 0.012, releaseS: 0.15, detuneCents: 0, level: 0.7 }, drums: { kick: 0.8, hat: 0.35, snare: 0.4, hatHpHz: 6500 } }, seeds: [11, 16, 18, 37, 58, 71, 81, 208, 251, 325], description: 'Sintes suaves, pads amplios.' } as const satisfies GenreProfile;
const POP_PROFILE = { id: 'pop', bpmMin: 76, bpmMax: 112, rootBaseHz: 110, scaleIntervals: [0, 2, 4, 5, 7, 9, 11], melodyDegrees: [0, 1, 2, 4, 5], progressions: [[0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4], [0, 3, 5, 4]], grooves: { kick: [[0, 8], [0, 4, 8, 12], [0, 8, 10], [0, 8]], hat: [[2, 6, 10, 14], [2, 6, 10, 14], [2, 6, 10, 14, 12], [6, 14]], bass: [[0], [0, 8], [0, 7], [0, 8]], snare: [[4, 12], [4, 12], [4, 12], [12]], swing: [false, false, false, false] }, swingS: 0.02, thresholds: { bass: 0.15, arpeggio: 0.35, drums: 0.5 }, cutoffMinHz: 700, cutoffMaxHz: 3600, gains: { pad: 0.15, bass: 0.24, arp: 0.14, drums: 0.2 }, timbre: { pad: { wave: 'sine', attackS: 1.2, releaseS: 2.2, detuneCents: 6, level: 1 }, bass: { wave: 'triangle', attackS: 0.025, releaseS: 0.18, detuneCents: 0, level: 0.95 }, arp: { wave: 'triangle', attackS: 0.01, releaseS: 0.14, detuneCents: 0, level: 0.75 }, drums: { kick: 0.85, hat: 0.32, snare: 0.5, hatHpHz: 6800 } }, seeds: [5, 27, 49, 73, 101, 133, 167, 199, 233, 271], description: 'Cuatro acordes, melodia cantable.' } as const satisfies GenreProfile;
const TECHNO_PROFILE = { id: 'techno', bpmMin: 96, bpmMax: 138, rootBaseHz: 110, scaleIntervals: [0, 2, 3, 5, 7, 8, 10], melodyDegrees: [0, 2, 3, 4, 6], progressions: [[0, 0, 0, 0], [0, 0, 3, 0], [0, 5, 0, 3], [0, 0, 5, 3]], grooves: { kick: [[0, 4, 8, 12], [0, 4, 8, 12], [0, 4, 8, 12, 14], [0, 4, 8, 12]], hat: [[0, 2, 4, 6, 8, 10, 12, 14], [2, 6, 10, 14, 0, 4, 8, 12], [0, 2, 4, 6, 8, 10, 12, 14], [2, 6, 10, 14]], bass: [[0, 4, 8, 12], [0, 8], [0, 4, 8, 12], [0, 12]], snare: [[4, 12], [4, 12], [4, 12, 15], [4, 12]], swing: [false, false, false, false] }, swingS: 0, thresholds: { bass: 0.25, arpeggio: 0.55, drums: 0.4 }, cutoffMinHz: 500, cutoffMaxHz: 4500, gains: { pad: 0.13, bass: 0.24, arp: 0.11, drums: 0.22 }, timbre: { pad: { wave: 'sawtooth', attackS: 1.2, releaseS: 2.0, detuneCents: 5, level: 0.6 }, bass: { wave: 'sawtooth', attackS: 0.02, releaseS: 0.16, detuneCents: 0, level: 0.85 }, arp: { wave: 'square', attackS: 0.008, releaseS: 0.12, detuneCents: 0, level: 0.5 }, drums: { kick: 0.9, hat: 0.38, snare: 0.45, hatHpHz: 7000 } }, seeds: [7, 29, 53, 91, 119, 151, 187, 223, 257, 293], description: 'Four-on-the-floor, bajo repetitivo.' } as const satisfies GenreProfile;
const DANCE_PROFILE = { id: 'dance', bpmMin: 88, bpmMax: 126, rootBaseHz: 110, scaleIntervals: [0, 2, 4, 5, 7, 9, 10], melodyDegrees: [0, 1, 2, 4, 5], progressions: [[0, 5, 3, 4], [0, 3, 5, 4], [5, 3, 0, 4], [0, 4, 3, 4]], grooves: { kick: [[0, 4, 8, 12], [0, 8, 12], [0, 4, 8, 12], [0, 4, 8, 12, 10]], hat: [[2, 6, 10, 14], [0, 4, 8, 12, 14], [2, 6, 10, 14, 7], [2, 6, 10, 14]], bass: [[0, 7, 10], [0, 3, 8, 10], [0, 7], [0, 6, 10]], snare: [[4, 12], [4, 12, 15], [4, 12], [4, 12]], swing: [false, true, false, true] }, swingS: 0.03, thresholds: { bass: 0.2, arpeggio: 0.3, drums: 0.45 }, cutoffMinHz: 700, cutoffMaxHz: 4000, gains: { pad: 0.15, bass: 0.23, arp: 0.15, drums: 0.21 }, timbre: { pad: { wave: 'triangle', attackS: 0.8, releaseS: 1.8, detuneCents: 6, level: 0.9 }, bass: { wave: 'triangle', attackS: 0.015, releaseS: 0.14, detuneCents: 0, level: 0.9 }, arp: { wave: 'square', attackS: 0.006, releaseS: 0.12, detuneCents: 0, level: 0.55 }, drums: { kick: 0.88, hat: 0.36, snare: 0.5, hatHpHz: 6800 } }, seeds: [9, 33, 61, 97, 127, 163, 197, 229, 263, 301], description: 'Bajo sincopado, melodia pegadiza.' } as const satisfies GenreProfile;
const CLASSIC_PROFILE = { id: 'classic', bpmMin: 60, bpmMax: 92, rootBaseHz: 110, scaleIntervals: [0, 2, 4, 5, 7, 9, 11], melodyDegrees: [0, 1, 2, 3, 4, 5, 6], progressions: [[0, 3, 4, 0], [0, 5, 3, 4], [1, 4, 0, 3], [0, 2, 4, 0]], grooves: { kick: [[], [], [], []], hat: [[], [], [14], []], bass: [[0], [0, 8], [0], [0, 8]], snare: [[], [], [], []], swing: [false, false, false, false] }, swingS: 0, thresholds: { bass: 0.25, arpeggio: 0.3, drums: 2 }, cutoffMinHz: 500, cutoffMaxHz: 2800, gains: { pad: 0.18, bass: 0.18, arp: 0.13, drums: 0 }, timbre: { pad: { wave: 'sine', attackS: 2.0, releaseS: 3.0, detuneCents: 4, level: 1 }, bass: { wave: 'sine', attackS: 0.05, releaseS: 0.3, detuneCents: 0, level: 0.85 }, arp: { wave: 'sine', attackS: 0.008, releaseS: 0.4, detuneCents: 0, level: 0.7 }, drums: { kick: 0, hat: 0, snare: 0, hatHpHz: 6500 } }, seeds: [13, 41, 67, 103, 139, 173, 211, 241, 277, 311], description: 'Cuerdas suaves, sin bateria.' } as const satisfies GenreProfile;
export const GENRE_PROFILES: Record<GenreId, GenreProfile> = { electronic: ELECTRONIC_PROFILE, pop: POP_PROFILE, techno: TECHNO_PROFILE, dance: DANCE_PROFILE, classic: CLASSIC_PROFILE };
