/**
 * Opacidad de la hoja de papel del tablero según el escenario activo.
 *
 * Pradera es un fondo claro y plano: la hoja puede ser muy translúcida sin
 * perder contraste. Los escenarios oscuros o con detalle (ciudad, espacio, mar)
 * necesitan una hoja más opaca para que las piezas y los huecos sigan
 * leyéndose. Con efectos OFF la hoja vuelve a ser sólida: no hay diorama que
 * enseñar y el render es más barato.
 */
export const OPAQUE_PANEL = 1;
export const DEFAULT_PANEL_OPACITY = 0.5;

const STAGE_PANEL_OPACITY: Record<string, number> = {
  pradera: 0.46,
  forest: 0.52,
  cityNight: 0.6,
  space: 0.64,
  deepSea: 0.6,
};

/** Opacidad final (0..1) para un escenario y estado de efectos. */
export function panelOpacityFor(stageId: string | null | undefined, effectsOn: boolean): number {
  if (!effectsOn) return OPAQUE_PANEL;
  if (!stageId) return DEFAULT_PANEL_OPACITY;
  const value = STAGE_PANEL_OPACITY[stageId];
  return value ?? DEFAULT_PANEL_OPACITY;
}
