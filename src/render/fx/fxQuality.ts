/** Calidad global de los efectos visuales. */
export type FxQuality = 'low' | 'medium' | 'high';

/** Orden ascendente, útil para UI y tests. */
export const FX_QUALITIES: readonly FxQuality[] = ['low', 'medium', 'high'];

/** Valida un valor de `localStorage`/DOM sin aceptar cadenas arbitrarias. */
export function isFxQuality(value: string | null | undefined): value is FxQuality {
  return value === 'low' || value === 'medium' || value === 'high';
}
