import { BOARD_H, BOARD_W, CAMERA_FOV } from './constants.js';

/**
 * Encuadre de la cámara: distancia y desplazamiento vertical para que el área
 * de juego (tablero + marco de cartón + washi tape) quepa siempre, centrada y
 * sin recortes, en cualquier formato de pantalla. Matemática pura, sin three.
 */

/** Medio ancho visual del área de juego (sigue a `boardRenderer.buildFrame`). */
export const PLAY_HALF_W = BOARD_W / 2 + 1.4; // rejilla + marco (T=0.62) + tape + contorno
/** Medio alto visual del área de juego (rejilla + marco + tape superior). */
export const PLAY_HALF_H = BOARD_H / 2 + 0.7;

/** Folgura extra: perspectiva del suelo, contorno de tinta y deriva de cámara. */
const FIT_MARGIN_W = 0.9;
const FIT_MARGIN_H = 0.75;

/** Bandas de UI que se solapan con la columna del tablero, en fracción del alto. */
export interface FrameBands {
  top: number;
  bottom: number;
}

export interface Frame {
  /** Distancia de la cámara al plano del tablero. */
  dist: number;
  /** Desplazamiento vertical del punto de mira: centra el tablero en el hueco libre. */
  targetY: number;
}

/**
 * Encaje del área de juego: manda la restricción más ajustada (ancho en
 * vertical, alto en horizontal). `bands` describe la UI superpuesta arriba y
 * abajo del tablero para centrarlo en el hueco realmente libre.
 */
export function frameFor(aspect: number, bands: FrameBands = { top: 0, bottom: 0 }): Frame {
  const tanHalf = Math.tan((CAMERA_FOV * Math.PI) / 360);
  // Altura visible = 2·dist·tan(fov/2); la anchura visible es lo mismo × aspecto.
  const occlusion = Math.min(0.8, Math.max(0, bands.top + bands.bottom));
  const free = 1 - occlusion;
  const distV = (PLAY_HALF_H + FIT_MARGIN_H) / (free * tanHalf);
  const distH = (PLAY_HALF_W + FIT_MARGIN_W) / (tanHalf * Math.max(aspect, 0.01));
  const dist = Math.max(distV, distH);
  // Si la banda inferior es mayor, el hueco libre está por encima del centro de
  // pantalla: el tablero sube (targetY negativo) y viceversa.
  const visibleH = 2 * dist * tanHalf;
  const targetY = ((bands.top - bands.bottom) / 2) * visibleH;
  return { dist, targetY };
}