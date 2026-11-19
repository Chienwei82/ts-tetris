/**
 * Muelle amortiguado para animar bloques: física pura (sin three.js ni DOM),
 * testeable con Vitest. El renderer lo usa para que la pieza activa y el
 * fantasma se deslicen entre celdas en vez de teletransportarse.
 *
 * Se usa amortiguamiento crítico (sin sobreoscilación: la pieza nunca se pasa
 * de su celda, importante para no confundir) con velocidad heredada entre
 * pasos consecutivos: una ráfaga DAS/ARR se ve como un deslizamiento tenso y
 * continuo, y al soltar converge en ~100 ms.
 */

/** Rigidez del muelle de la pieza activa (1/s²): ~99 % en 60 ms. */
export const ACTIVE_STIFFNESS = 4200;
/** Amortiguamiento crítico para una rigidez dada. */
export function criticalDamping(stiffness: number): number {
  return 2 * Math.sqrt(Math.max(1, stiffness));
}
/** Rigidez del fantasma: más pegado a su objetivo que la pieza. */
export const GHOST_STIFFNESS = 6000;

/** Paso máximo de integración: con dt mayores se subdivide (estable hasta k=2500). */
const MAX_STEP = 1 / 120;

export interface SpringSample {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Integra un paso de muelle crítico 2D (Euler semi-implícito con substeps).
 * Mutación in situ de `s`; nunca diverge (dt topado y subdividido).
 */
export function stepSpring(s: SpringSample, tx: number, ty: number, dt: number, stiffness: number, damping: number): void {
  if (!(dt > 0)) return;
  const k = Math.max(1, stiffness);
  const c = Math.max(0, damping);
  let remaining = Math.min(dt, 0.1);
  while (remaining > 0) {
    const h = Math.min(remaining, MAX_STEP);
    remaining -= h;
    s.vx += (-k * (s.x - tx) - c * s.vx) * h;
    s.vy += (-k * (s.y - ty) - c * s.vy) * h;
    s.x += s.vx * h;
    s.y += s.vy * h;
  }
  if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.vx) || !Number.isFinite(s.vy)) {
    s.x = tx; s.y = ty; s.vx = 0; s.vy = 0;
  }
}

/** Distancia² a la que un bloque se considera asentado (snap exacto, sin tembleque). */
export const SETTLE_DIST_SQ = 1e-6;
/** Velocidad² por debajo de la cual el bloque se considera quieto. */
export const SETTLE_SPEED_SQ = 4e-4;

/** True si el muelle ya está (visualmente) clavado en su objetivo. */
export function isSettled(s: SpringSample, tx: number, ty: number): boolean {
  const dx = s.x - tx; const dy = s.y - ty;
  return dx * dx + dy * dy < SETTLE_DIST_SQ && s.vx * s.vx + s.vy * s.vy < SETTLE_SPEED_SQ;
}

/**
 * Empareja cada origen con un destino libre por cercanía (greedy): devuelve,
 * para cada índice de origen, el índice del destino asignado. Así un paso
 * lateral o una rotación mueve cada bloque al destino más cercano en vez de
 * cruzarlos (el orden `y,x` producía remolinos al rotar).
 */
export function matchByProximity(fromX: number[], fromY: number[], toX: number[], toY: number[]): number[] {
  const n = Math.min(fromX.length, fromY.length, toX.length, toY.length);
  const assign: number[] = new Array(n).fill(-1);
  const taken: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const fx = fromX[i] ?? 0; const fy = fromY[i] ?? 0;
    let best = -1; let bestD = Number.POSITIVE_INFINITY;
    for (let j = 0; j < n; j++) {
      if (taken[j]) continue;
      const dx = fx - (toX[j] ?? 0); const dy = fy - (toY[j] ?? 0);
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = j; }
    }
    assign[i] = best < 0 ? i : best;
    if (best >= 0) taken[best] = true;
  }
  return assign;
}
