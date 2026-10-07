/** GenreCrossfader: calculo puro del crossfade (curvas de igual potencia). */
export const CROSSFADE_BARS = 2;
export function crossfadeGains(elapsedBars: number, totalBars = CROSSFADE_BARS): { out: number; in: number } {
  const t = totalBars <= 0 ? 1 : Math.min(1, Math.max(0, elapsedBars / totalBars));
  return { out: Math.cos((t * Math.PI) / 2), in: Math.sin((t * Math.PI) / 2) };
}
export function isCrossfadeDone(elapsedBars: number, totalBars = CROSSFADE_BARS): boolean { return elapsedBars >= totalBars; }
