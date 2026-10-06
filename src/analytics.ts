import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';

/**
 * Vercel Web Analytics + Speed Insights para el despliegue en Vercel.
 *
 * `inject()` inyecta el script de Web Analytics y registra page views (la app es
 * una sola página, sin rutas). Con `mode: 'auto'` solo se envían eventos en
 * producción; en desarrollo se loguean en consola. `injectSpeedInsights()` mide
 * Web Vitals. Ambos scripts se cargan desde Vercel, sin coste para el bundle
 * de three.js (quedan en el chunk de la app, fuera del chunk del motor 3D).
 */
export function initAnalytics(): void {
  inject({ mode: 'auto' });
  injectSpeedInsights();
}