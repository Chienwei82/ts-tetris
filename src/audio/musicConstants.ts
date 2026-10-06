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