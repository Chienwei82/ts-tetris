/**
 * Iluminación del diorama.
 *
 * Los fondos (temas clásicos y escenarios 3D) cambian de paleta, pero la luz que
 * reciben el escenario y las piezas NO debe apagarse con ellos: si se aplican
 * tal cual sus intensidades (varios escenarios usan la mitad que el día), el
 * tablero y las piezas pierden color y contraste. Aquí se "gradúa" el look de
 * cada fondo antes de llevarlo a la escena:
 *
 * - la intensidad conserva solo una fracción de la diferencia con la luz de
 *   referencia (Pradera) y nunca baja de un mínimo legible;
 * - los colores de luz se mezclan hacia la referencia, de modo que el tinte del
 *   fondo se perciba sin oscurecer el papel;
 * - el suelo se acerca a la paleta de papel (no se va a negro);
 * - la niebla nunca empieza delante del plano del tablero.
 *
 * Módulo puro (sin three.js ni DOM): se prueba con Vitest.
 */

/** Parte de un look (tema o escenario) que ilumina la escena. */
export interface SceneLighting {
  hemi: { sky: number; ground: number; intensity: number };
  key: { color: number; intensity: number };
  fill: { color: number; intensity: number };
  ground: number;
  fog: { near: number; far: number };
}

/** Forma mínima que debe cumplir un look para poder graduarse. */
export interface LookLightingSource {
  hemi: { sky: number; ground: number; intensity: number };
  key: { color: number; intensity: number };
  fill: { color: number; intensity: number };
  ground: { color: number };
  fog: { near: number; far: number };
}

/** Extrae la iluminación de un look (tema clásico o escenario). */
export function lightingOf(look: LookLightingSource): SceneLighting {
  return {
    hemi: look.hemi,
    key: look.key,
    fill: look.fill,
    ground: look.ground.color,
    fog: look.fog
  };
}

/** Gradación artística del tema clásico: menos ambiente y más luz clave. */
export const HEMI_GRADE = 0.62;
export const KEY_GRADE = 1.28;

/** Luz de referencia del diorama (tema Pradera), sin gradación. */
export const REFERENCE_LOOK: SceneLighting = {
  hemi: { sky: 0xfff4dd, ground: 0xd8c9a8, intensity: 0.95 },
  key: { color: 0xfff1d6, intensity: 1.5 },
  fill: { color: 0xd8ecff, intensity: 0.22 },
  ground: 0xf2e6cc,
  fog: { near: 34, far: 95 }
};

/** Fracción de la diferencia con la referencia que se conserva (0 = fija). */
const INTENSITY_KEEP = 0.3;
const COLOR_KEEP = 0.45;
const GROUND_KEEP = 0.4;

/** Suelo de legibilidad: por debajo, el papel y las piezas pierden contraste. */
export const MIN_HEMI_INTENSITY = 0.46;
export const MIN_KEY_INTENSITY = 1.4;
export const MIN_FILL_INTENSITY = 0.16;

/** Intensidades finales de referencia (ya con la gradación clásica). */
const REF_HEMI = REFERENCE_LOOK.hemi.intensity * HEMI_GRADE;
const REF_KEY = REFERENCE_LOOK.key.intensity * KEY_GRADE;
const REF_FILL = REFERENCE_LOOK.fill.intensity;

/** Mezcla lineal de dos colores hex `0xRRGGBB` (t = 0 → a, t = 1 → b). */
export function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** Conserva una fracción de la diferencia con la referencia, con suelo legible. */
function dampIntensity(value: number, ref: number, min: number): number {
  return Math.max(min, ref + (value - ref) * INTENSITY_KEEP);
}

/** Acerca un color de luz a la referencia: tinte sin perder luminosidad. */
function dampColor(raw: number, ref: number, keep: number): number {
  return mixHex(ref, raw, keep);
}

/**
 * La niebla pertenece al horizonte: nunca debe empezar delante del plano del
 * tablero (~32 u de la cámara) ni teñir el papel. Solo se aleja su comienzo;
 * su final se respeta para no cambiar el velo de la escenografía.
 */
function gradeFog(fog: { near: number; far: number }): { near: number; far: number } {
  const near = Math.max(fog.near, REFERENCE_LOOK.fog.near);
  return { near, far: Math.max(fog.far, near + 1) };
}

/**
 * Gradúa el look de un fondo para que el escenario cambie de ambiente sin
 * oscurecer el diorama: el resultado se puede aplicar tal cual a las luces.
 */
export function gradeSceneLighting(raw: SceneLighting): SceneLighting {
  return {
    hemi: {
      sky: dampColor(raw.hemi.sky, REFERENCE_LOOK.hemi.sky, COLOR_KEEP),
      ground: dampColor(raw.hemi.ground, REFERENCE_LOOK.hemi.ground, COLOR_KEEP),
      intensity: dampIntensity(raw.hemi.intensity * HEMI_GRADE, REF_HEMI, MIN_HEMI_INTENSITY)
    },
    key: {
      color: dampColor(raw.key.color, REFERENCE_LOOK.key.color, COLOR_KEEP),
      intensity: dampIntensity(raw.key.intensity * KEY_GRADE, REF_KEY, MIN_KEY_INTENSITY)
    },
    fill: {
      color: dampColor(raw.fill.color, REFERENCE_LOOK.fill.color, COLOR_KEEP),
      intensity: dampIntensity(raw.fill.intensity, REF_FILL, MIN_FILL_INTENSITY)
    },
    ground: dampColor(raw.ground, REFERENCE_LOOK.ground, GROUND_KEEP),
    fog: gradeFog(raw.fog)
  };
}
