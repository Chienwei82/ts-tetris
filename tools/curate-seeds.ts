#!/usr/bin/env node
/**
 * Curación de canciones: explora miles de semillas, puntúa cada una con
 * `songScore` (variedad + movimiento + anti-repetición) y emite la lista de
 * 50 semillas curadas (`CURATED_SONG_SEEDS`) con cobertura de los 18 estilos.
 *
 * Uso: `npm run curate`. La lista impresa se pega en `musicConstants.ts`.
 * Es una herramienta de desarrollo: no forma parte del bundle del juego.
 *
 * Nota técnica: Node con type-stripping no resuelve los imports con
 * extensión `.js` del código fuente, así que este script NO importa el
 * módulo original: lo copia a /tmp reescribiendo los imports y carga la copia
 * (un import estático del original fallaría antes de llegar a esa copia).
 */
import { CURATED_MIN_SCORE } from '../src/audio/musicConstants.ts';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Reescribe los imports `.js` → `.ts` de un fuente para poder cargarlo con
 * type-stripping (los identifica por extensión, así que solo acepta `.ts`).
 */
function loadableSource(path: string): string {
  return readFileSync(path, 'utf8').replace(/from '(\.[^']*)\.js'/g, "from '$1.ts'");
}

const tmp = '/tmp/curate-load';
writeFileSync(tmp + '-constants.ts', loadableSource('src/audio/musicConstants.ts'));
writeFileSync(tmp + '-rng.ts', loadableSource('src/audio/musicRng.ts'));
writeFileSync(
  tmp + '-patterns.ts',
  loadableSource('src/audio/musicPatterns.ts')
    .replace(/from '\.\/musicConstants\.ts'/g, "from '" + tmp + "-constants.ts'")
    .replace(/from '\.\/musicRng\.ts'/g, "from '" + tmp + "-rng.ts'")
);
const patterns = await import(tmp + '-patterns.ts');
const scoreFn = patterns.songScore as (seed: number) => number;
const profileFn = patterns.songProfile as (seed: number) => {
  progression: number; groove: number; rotation: number;
};

const CANDIDATES = 4000;
const WANTED = 50;

const scored = [];
for (let seed = 1; seed <= CANDIDATES; seed++) {
  scored.push({ seed, score: scoreFn(seed), profile: profileFn(seed) });
}
scored.sort((a, b) => b.score - a.score);

// Selección golosa con diversidad: cobertura de los 18 estilos primero.
const picked = [];
const styles = new Set();
for (const entry of scored) {
  if (picked.length >= WANTED) break;
  const key = entry.profile.progression + '-' + entry.profile.groove;
  if (!styles.has(key) && entry.score >= CURATED_MIN_SCORE) {
    styles.add(key);
    picked.push(entry);
  }
}
for (const entry of scored) {
  if (picked.length >= WANTED) break;
  if (picked.includes(entry)) continue;
  picked.push(entry);
}
picked.sort((a, b) => b.score - a.score);

const minScore = picked.length > 0 ? Math.min(...picked.map((p) => p.score)) : 0;
const coveredStyles = new Set(picked.map((p) => p.profile.progression + '-' + p.profile.groove));
console.log('// ' + picked.length + ' semillas curadas (nota mínima ' + minScore + ', ' + coveredStyles.size + '/18 estilos).');
console.log('// Generado con `npm run curate` — ver tools/curate-seeds.ts.');
console.log('export const CURATED_SONG_SEEDS = [');
const rows = [];
for (let i = 0; i < picked.length; i += 10) {
  rows.push('  ' + picked.slice(i, i + 10).map((p) => String(p.seed)).join(', ') + ',');
}
console.log(rows.join('\n'));
console.log('] as const;');
console.log('// Detalle: semilla → nota, progresión, groove, rotación.');
for (const p of picked) {
  console.log('// ' + p.seed + ' → ' + p.score + ' (P' + p.profile.progression + ' G' + p.profile.groove + ' R' + p.profile.rotation + ')');
}
