import type { PieceKind } from '../game/types.js';

/**
 * Motivos por pieza para no depender solo del color (daltonismo y pantallas
 * lavadas). Son datos puros: cada forma vive en coordenadas normalizadas 0..1
 * dentro de la celda, así el mismo dibujo sirve para los bloques 3D (textura
 * procedural de 256 px) y para las previews 2D del HUD (celdas de ~20-40 px).
 *
 * El trazo es deliberadamente escaso: la pieza debe seguir leyéndose como papel
 * troquelado, no como un icono de interfaz.
 */
export type MotifPoint = readonly [number, number];
export interface MotifDot {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}
export interface PieceMotif {
  /** Polilíneas que se dibujan como trazo redondeado. */
  readonly polys: ReadonlyArray<ReadonlyArray<MotifPoint>>;
  /** Puntos rellenos (el bloque O usa lunares en vez de trazos). */
  readonly dots: ReadonlyArray<MotifDot>;
}
export interface MotifBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface MotifStyle {
  color: string;
  lineWidth: number;
  alpha: number;
}

/**
 * Un patrón distinto por pieza: verticales (I), lunares (O), T, diagonales
 * opuestas (S/Z) y chevrones opuestos (J/L). Se reconocen también en blanco y
 * negro y a tamaño de preview.
 */
export const PIECE_MOTIFS: Record<PieceKind, PieceMotif> = {
  I: {
    polys: [
      [[0.26, 0.18], [0.26, 0.82]],
      [[0.5, 0.18], [0.5, 0.82]],
      [[0.74, 0.18], [0.74, 0.82]],
    ],
    dots: [],
  },
  O: {
    polys: [],
    dots: [
      { x: 0.3, y: 0.3, r: 0.09 },
      { x: 0.7, y: 0.3, r: 0.09 },
      { x: 0.3, y: 0.7, r: 0.09 },
      { x: 0.7, y: 0.7, r: 0.09 },
    ],
  },
  T: {
    polys: [
      [[0.18, 0.32], [0.82, 0.32]],
      [[0.5, 0.32], [0.5, 0.84]],
    ],
    dots: [],
  },
  S: {
    polys: [
      [[0.16, 0.84], [0.54, 0.16]],
      [[0.46, 0.84], [0.84, 0.16]],
    ],
    dots: [],
  },
  Z: {
    polys: [
      [[0.16, 0.16], [0.54, 0.84]],
      [[0.46, 0.16], [0.84, 0.84]],
    ],
    dots: [],
  },
  J: {
    polys: [
      [[0.74, 0.2], [0.42, 0.5], [0.74, 0.8]],
      [[0.52, 0.2], [0.2, 0.5], [0.52, 0.8]],
    ],
    dots: [],
  },
  L: {
    polys: [
      [[0.26, 0.2], [0.58, 0.5], [0.26, 0.8]],
      [[0.48, 0.2], [0.8, 0.5], [0.48, 0.8]],
    ],
    dots: [],
  },
};

/** Etiqueta corta del motivo, para la ayuda y las pruebas. */
export const MOTIF_LABEL: Record<PieceKind, string> = {
  I: 'III',
  O: '••••',
  T: 'T',
  S: '//',
  Z: '\\\\',
  J: '<<',
  L: '>>',
};

/** Firma estable del motivo: permite comprobar que las 7 piezas son distintas. */
export function motifSignature(kind: PieceKind): string {
  const m = PIECE_MOTIFS[kind];
  const polys = m.polys.map((p) => p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')).join('|');
  const dots = m.dots.map((d) => `${d.x.toFixed(2)},${d.y.toFixed(2)},${d.r.toFixed(2)}`).join('|');
  return `${polys}#${dots}`;
}

/** Dibuja el motivo dentro de una caja (canvas 2D). No cambia el estado global. */
export function drawPieceMotif(
  ctx: CanvasRenderingContext2D,
  kind: PieceKind,
  box: MotifBox,
  style: MotifStyle
): void {
  const motif = PIECE_MOTIFS[kind];
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, style.alpha));
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color;
  ctx.lineWidth = Math.max(0.4, style.lineWidth);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const poly of motif.polys) {
    let started = false;
    ctx.beginPath();
    for (const [nx, ny] of poly) {
      const px = box.x + nx * box.w;
      const py = box.y + ny * box.h;
      if (started) ctx.lineTo(px, py);
      else { ctx.moveTo(px, py); started = true; }
    }
    if (started) ctx.stroke();
  }
  const unit = Math.min(box.w, box.h);
  for (const d of motif.dots) {
    ctx.beginPath();
    ctx.arc(box.x + d.x * box.w, box.y + d.y * box.h, d.r * unit, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
