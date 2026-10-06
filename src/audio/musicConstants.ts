/**
 * Constantes de la música procedural: tonalidad, tempo, umbrales de capas y
 * mezcla. Sin números mágicos — el carácter de la música se ajusta aquí.
 */

/** Tónica del sistema tonal: La2 (110 Hz). */
export const ROOT_FREQ = 110;

/**
 * Escala dórica de La (A B C D E F# G) en semitonos sobre la tónica.
 * Todo el material —acordes, bajo, arpegio— deriva de estos grados.
 */
export const SCALE_INTERVALS = [0, 2, 3, 5, 7, 9, 10] as const;

/**
 * Subconjunto pentatónico menor de La (índices de escala: A C D E G).
 * El arpegio/melodía se limita a estos grados: sin semitonos, sin disonancias.
 */
export const MELODY_DEGREES = [0, 2, 3, 4, 6] as const;

/** Progresión modal como raíces en índices de escala: Am – D – G – C. */
export const CHORD_ROOT_DEGREES = [0, 3, 6, 2] as const;

/**
 * Tres progresiones modales (raíces en grados de escala), todas consonantes y
 * diatónicas. El índice 0 es la progresión base (Am–D–G–C).
 */
export const CHORD_PROGRESSIONS = [
  [0, 3, 6, 2],
  [0, 6, 3, 4],
  [2, 6, 3, 0],
] as const;

/**
 * Seis patrones rítmicos por capa (pasos de semicorchea). El swing desplaza
 * ligeramente los pasos débiles para un groove menos robótico.
 */
export const GROOVE_KICK_STEPS = [
  [0, 8],
  [0, 4, 8, 12],
  [0, 7, 11],
  [0],
  [0, 8],
  [0],
] as const;
export const GROOVE_HAT_STEPS = [
  [2, 6, 10, 14],
  [2, 6, 10, 14, 4, 12],
  [2, 6, 10, 14],
  [6, 14],
  [2, 4, 6, 10, 12, 14],
  [4, 12],
] as const;
export const GROOVE_BASS_STEPS = [
  [0],
  [0, 8],
  [0, 10],
  [0],
  [0, 8],
  [0, 8],
] as const;
export const GROOVE_SWING = [false, false, true, false, true, false] as const;

/** Desplazamiento rítmico (segundos) de los pasos débiles con swing. */
export const SWING_S = 0.04;

/**
 * Curación de canciones: qué se considera una "buena" semilla.
 * - SONG_BARS: compases analizados al puntuar (un ciclo completo de 8).
 * - HIGH_DENSITY: las notas por debajo de este umbral casi siempre suenan.
 * - MIN_DEGREES: grados de escala distintos esperados en una buena melodía.
 * - MAX_REPEAT: repeticiones seguidas toleradas antes de penalizar.
 * - Pesos de variedad melódica, movimiento y anti-repetición (suman 1).
 */
export const SONG_BARS = 8;
export const HIGH_DENSITY = 0.6;
export const MIN_DEGREES = 5;
export const MAX_REPEAT = 6;
export const VARIETY_WEIGHT = 0.45;
export const MOTION_WEIGHT = 0.3;
export const REPEAT_WEIGHT = 0.25;
export const MOTION_TARGET = 1.2;

/** Nota mínima de calidad para entrar en la lista curada. */
export const CURATED_MIN_SCORE = 78;

// 50 semillas curadas (nota mínima 100, 18/18 estilos).
// Generado con `npm run curate` — ver tools/curate-seeds.ts.
export const CURATED_SONG_SEEDS = [
  11, 16, 18, 37, 58, 71, 81, 208, 251, 325,
  345, 354, 381, 401, 426, 485, 503, 580, 83, 164,
  181, 205, 220, 230, 258, 280, 284, 292, 317, 348,
  374, 376, 384, 388, 410, 414, 420, 457, 464, 468,
  477, 494, 495, 530, 552, 569, 571, 576, 615, 649,
] as const;

/** Compases que dura cada acorde (progresión lenta de 8 compases). */
export const BARS_PER_CHORD = 2;

/** Resolución rítmica: semicorcheas por compás de 4 tiempos. */
export const BEATS_PER_BAR = 4;
export const STEPS_PER_BAR = BEATS_PER_BAR * 4;

/** Tempo: 70 BPM en calma hasta 100 BPM como máximo. */
export const BPM_MIN = 70;
export const BPM_MAX = 100;

/** Umbrales de intensidad (0..1) a los que entra cada capa. */
export const THRESHOLD_BASS = 0.2;
export const THRESHOLD_ARPEGIO = 0.4;
export const THRESHOLD_DRUMS = 0.6;

/** Densidad de la máscara de notas en los extremos de intensidad. */
export const MASK_DENSITY_MIN = 0.25;
export const MASK_DENSITY_MAX = 1;

/** Brillo (frecuencia de corte del filtro global) según intensidad. */
export const CUTOFF_MIN_HZ = 600;
export const CUTOFF_MAX_HZ = 3800;

/** Mezcla: volúmenes moderados + limitador (compresor) en la salida. */
export const MASTER_PEAK = 0.5;
export const PAD_GAIN = 0.16;
export const BASS_GAIN = 0.22;
export const ARP_GAIN = 0.12;
export const DRUM_GAIN = 0.18;

/** Envoltura del pad (segundos): ataques largos = sensación espaciosa. */
export const PAD_ATTACK_S = 1.6;
export const PAD_RELEASE_S = 2.5;
/** Desafinación de las voces del pad (centavos) para ensanchar el sonido. */
export const PAD_DETUNE_CENTS = 7;

/** Scheduler lookahead (segundos hacia delante desde currentTime). */
export const LOOKAHEAD_S = 0.12;
/** Cadencia del reloj de control (ms). Nunca es el reloj del audio. */
export const TICK_MS = 25;

/** Suavizado de intensidad: sube rápido (~1.5 s) y baja despacio (~4 s). */
export const SMOOTHING_UP_S = 1.5;
export const SMOOTHING_DOWN_S = 4;

/** Fundidos de enable/disable y pausa (segundos). */
export const FADE_IN_S = 0.8;
export const FADE_OUT_S = 0.4;

/** Decaimiento del pulso de eventos del juego (segundos). */
export const EVENT_DECAY_TAU_S = 4;

/** Delay con feedback: "reverb" simple, sin ficheros ni convolución. */
export const DELAY_TIME_S = 0.32;
export const DELAY_FEEDBACK = 0.32;
export const DELAY_FILTER_HZ = 2400;