/** GenreRegistry: catalogo + seleccion de semillas (puro, testeable). */
import type { GenreId } from './genreProfiles.js';
import { DEFAULT_GENRE, GENRE_IDS, GENRE_PROFILES, isGenreId } from './genreProfiles.js';
export function genreIds(): GenreId[] { return [...GENRE_IDS]; }
export function profileOf(genre: GenreId): (typeof GENRE_PROFILES)[GenreId] { return GENRE_PROFILES[genre]; }
export function normalizeGenre(value: unknown): GenreId { return isGenreId(value) ? value : DEFAULT_GENRE; }
export function seedsOf(genre: GenreId): ReadonlyArray<number> { return GENRE_PROFILES[genre].seeds; }
export function pickSeed(genre: GenreId, random: () => number, previous?: number): number {
  const seeds = seedsOf(genre);
  if (seeds.length === 0) return 1;
  if (seeds.length === 1) return seeds[0] ?? 1;
  let idx = Math.floor(random() * seeds.length) % seeds.length;
  const prevIdx = previous === undefined ? -1 : seeds.indexOf(previous);
  if (prevIdx >= 0 && idx === prevIdx) idx = (idx + 1) % seeds.length;
  return seeds[idx] ?? seeds[0] ?? 1;
}
export function pickSeedRandom(genre: GenreId, previous?: number): number { return pickSeed(genre, Math.random, previous); }
