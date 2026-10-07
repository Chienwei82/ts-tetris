import { describe, expect, it } from 'vitest';
import { GENRE_IDS, GENRE_PROFILES, isGenreId } from '../src/audio/genreProfiles.js';
import { barPatternFor, chordForGenreBar, cutoffForGenre, freqForGenreDegree, layersForGenre, maskDensityForGenre, rootHzFor, songProfileFor, tempoForGenre } from '../src/audio/genrePatterns.js';
import { normalizeGenre, pickSeed, seedsOf } from '../src/audio/genreRegistry.js';
import { CROSSFADE_BARS, crossfadeGains, isCrossfadeDone } from '../src/audio/genreCrossfader.js';
import { STEPS_PER_BAR } from '../src/audio/musicConstants.js';
function seqRandom(seq: number[]): () => number { let i = 0; return () => seq[i++ % seq.length] ?? 0; }
describe('registro de generos', () => {
  it('hay 5 generos con 10 semillas cada uno', () => {
    expect(GENRE_IDS.length).toBe(5);
    for (const g of GENRE_IDS) expect(seedsOf(g).length).toBe(10);
  });
  it('pickSeed no repite la anterior consecutiva', () => {
    for (const g of GENRE_IDS) {
      const seeds = seedsOf(g);
      // random que siempre cae en el indice de previous
      const prev = seeds[3] ?? 1;
      const idxRandom = () => 0.35; // cae en indice 3 de 10
      expect(pickSeed(g, idxRandom, prev)).not.toBe(prev);
      // determinista dado (random, previous)
      expect(pickSeed(g, seqRandom([0.1]), undefined)).toBe(pickSeed(g, seqRandom([0.1]), undefined));
    }
  });
  it('normalizeGenre cae a electronic con valores raros', () => {
    expect(normalizeGenre('techno')).toBe('techno');
    expect(normalizeGenre('rock')).toBe('electronic');
    expect(normalizeGenre(null)).toBe('electronic');
    expect(isGenreId('pop')).toBe(true);
    expect(isGenreId('jazz')).toBe(false);
  });
});
describe('determinismo por semilla', () => {
  it('misma (genero, semilla, compas) => mismo patron', () => {
    for (const g of GENRE_IDS) {
      expect(barPatternFor(g, 42, 2)).toEqual(barPatternFor(g, 42, 2));
      expect(songProfileFor(g, 42)).toEqual(songProfileFor(g, 42));
    }
  });
  it('las 10 semillas de cada genero suenan distintas (tonica/progresion/groove)', () => {
    for (const g of GENRE_IDS) {
      const keys = new Set(seedsOf(g).map((s) => { const p = songProfileFor(g, s); return p.tonicOffset + '-' + p.progression + '-' + p.groove + '-' + p.rotation; }));
      expect(keys.size).toBeGreaterThanOrEqual(8);
    }
  });
});
describe('notas dentro de la escala del genero', () => {
  it('acordes y arpegios solo usan grados diatonicos', () => {
    for (const g of GENRE_IDS) {
      const profile = GENRE_PROFILES[g];
      for (const seed of seedsOf(g)) {
        for (let bar = 0; bar < 4; bar++) {
          const p = barPatternFor(g, seed, bar);
          for (const d of p.chord) {
            const deg = ((d % 7) + 7) % 7;
            expect(deg).toBeGreaterThanOrEqual(0); expect(deg).toBeLessThan(7);
          }
          for (const s of p.arpeggio) {
            const idx = ((s.degree % 7) + 7) % 7;
            expect(profile.melodyDegrees).toContain(idx);
            expect(Number.isFinite(freqForGenreDegree(profile, 0, s.degree))).toBe(true);
          }
        }
      }
    }
  });
  it('rootHzFor sube una octava con 12 semitonos', () => {
    const profile = GENRE_PROFILES.electronic;
    expect(rootHzFor(profile, 12)).toBeCloseTo(rootHzFor(profile, 0) * 2);
  });
});
describe('mapeo intensidad -> capas/BPM por perfil', () => {
  it('respeta bpmMin/bpmMax y es monotono', () => {
    for (const g of GENRE_IDS) {
      const profile = GENRE_PROFILES[g];
      expect(tempoForGenre(profile, 0)).toBe(profile.bpmMin);
      expect(tempoForGenre(profile, 1)).toBe(profile.bpmMax);
      expect(tempoForGenre(profile, 0.3)).toBeLessThan(tempoForGenre(profile, 0.8));
    }
  });
  it('respeta umbrales de cada perfil', () => {
    for (const g of GENRE_IDS) {
      const profile = GENRE_PROFILES[g];
      const t = profile.thresholds;
      expect(layersForGenre(profile, 0)).toEqual({ bass: false, arpeggio: false, drums: false });
      if (t.bass <= 1) expect(layersForGenre(profile, t.bass).bass).toBe(true);
      if (t.arpeggio <= 1) expect(layersForGenre(profile, t.arpeggio).arpeggio).toBe(true);
      if (t.drums <= 1) expect(layersForGenre(profile, t.drums).drums).toBe(true);
      else expect(layersForGenre(profile, 1).drums).toBe(false); // classic: sin bateria
    }
  });
  it('cutoff y densidad crecen con la intensidad', () => {
    for (const g of GENRE_IDS) {
      const profile = GENRE_PROFILES[g];
      expect(cutoffForGenre(profile, 0)).toBe(profile.cutoffMinHz);
      expect(cutoffForGenre(profile, 1)).toBe(profile.cutoffMaxHz);
      expect(maskDensityForGenre(profile, 0.5)).toBeLessThanOrEqual(maskDensityForGenre(profile, 1));
    }
  });
  it('techno es mas rapido que classic en ambos extremos', () => {
    expect(GENRE_PROFILES.techno.bpmMin).toBeGreaterThan(GENRE_PROFILES.classic.bpmMin);
    expect(GENRE_PROFILES.techno.bpmMax).toBeGreaterThan(GENRE_PROFILES.classic.bpmMax);
  });
  it('los patrones tienen 16 pasos y acordes de 3 notas', () => {
    for (const g of GENRE_IDS) {
      const p = barPatternFor(g, 7, 0);
      expect(p.arpeggio.length).toBe(STEPS_PER_BAR);
      expect(chordForGenreBar(g, 7, 0).length).toBe(3);
    }
  });
});
describe('crossfade', () => {
  it('curvas de igual potencia: empieza en out y termina en in', () => {
    expect(crossfadeGains(0)).toEqual({ out: 1, in: 0 });
    const end = crossfadeGains(CROSSFADE_BARS);
    expect(end.out).toBeCloseTo(0, 5); expect(end.in).toBeCloseTo(1, 5);
    const mid = crossfadeGains(CROSSFADE_BARS / 2);
    expect(mid.out * mid.out + mid.in * mid.in).toBeCloseTo(1, 5);
  });
  it('isCrossfadeDone al completar los compases', () => {
    expect(isCrossfadeDone(CROSSFADE_BARS - 1)).toBe(false);
    expect(isCrossfadeDone(CROSSFADE_BARS)).toBe(true);
  });
});
