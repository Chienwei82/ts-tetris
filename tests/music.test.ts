import { describe, expect, it } from 'vitest';
import {
  BPM_MAX, BPM_MIN, CUTOFF_MAX_HZ, CUTOFF_MIN_HZ, CURATED_MIN_SCORE, CURATED_SONG_SEEDS,
  MASK_DENSITY_MIN, MELODY_DEGREES,
  ROOT_FREQ, SCALE_INTERVALS, THRESHOLD_ARPEGIO, THRESHOLD_BASS, THRESHOLD_DRUMS
} from '../src/audio/musicConstants.js';
import { IntensityTracker } from '../src/audio/intensityTracker.js';
import type { IntensitySignals } from '../src/audio/intensityTracker.js';
import {
  barPattern, chordForBar, cutoffFor, freqForDegree, layersForIntensity,
  maskDensityFor, pickCuratedSeed, songProfile, songScore, tempoFor
} from '../src/audio/musicPatterns.js';
import { hashSeed, mulberry32, rngForBar } from '../src/audio/musicRng.js';

const SCALE_SEMITONES = new Set<number>(SCALE_INTERVALS);
const PENTA_INDICES = new Set<number>(MELODY_DEGREES);

/** Semitonos de una frecuencia sobre la tónica. */
function semitonesFromRoot(freq: number): number {
  return 12 * Math.log2(freq / ROOT_FREQ);
}
function inScale(freq: number): boolean {
  const semi = Math.round(semitonesFromRoot(freq));
  return SCALE_SEMITONES.has(((semi % 12) + 12) % 12);
}
const ALL_OFF: IntensitySignals = { stackHeight: 0, level: 0, levelProgress: 0, combo: 0 };
const ALL_ON: IntensitySignals = { stackHeight: 1, level: 1, levelProgress: 1, combo: 4 };

describe('RNG determinista (mulberry32)', () => {
  it('reproduce la misma secuencia con la misma semilla', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });
  it('semillas distintas producen secuencias distintas', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).not.toEqual(seqB);
  });
  it('los valores quedan en el rango [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('hashSeed es estable y distinto por texto', () => {
    expect(hashSeed('paper')).toBe(hashSeed('paper'));
    expect(hashSeed('paper')).not.toBe(hashSeed('quest'));
    expect(hashSeed(123)).toBe(123);
  });
  it('rngForBar depende solo de (semilla, compás)', () => {
    const a = rngForBar(42, 3);
    const b = rngForBar(42, 3);
    const c = rngForBar(42, 4);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
    expect(rngForBar(42, 3)()).not.toBe(c());
  });
});
describe('patrones musicales', () => {
  it('el material de un compás es determinista para una semilla', () => {
    expect(barPattern(7, 2)).toEqual(barPattern(7, 2));
    expect(barPattern(7, 2)).not.toEqual(barPattern(8, 2));
    expect(barPattern(7, 2)).not.toEqual(barPattern(7, 3));
  });
  it('todas las notas del patrón pertenecen a la escala', () => {
    for (const seed of [1, 2, 42]) {
      for (let bar = 0; bar < 8; bar++) {
        const p = barPattern(seed, bar);
        for (const d of p.chord) expect(inScale(freqForDegree(d))).toBe(true);
        for (const s of p.arpeggio) expect(inScale(freqForDegree(s.degree))).toBe(true);
      }
    }
  });
  it('el arpegio queda dentro de la pentatónica (sin disonancias)', () => {
    for (let bar = 0; bar < 8; bar++) {
      for (const s of barPattern(42, bar).arpeggio) {
        const idx = ((s.degree % 7) + 7) % 7;
        expect(PENTA_INDICES.has(idx)).toBe(true);
      }
    }
  });
  it('la progresión base rota Am–D–G–C cada 2 compases', () => {
    // Semilla 0 → progresión 0, groove 2, rotación 2 (mismo contenido, otro orden).
    expect(chordForBar(0, 0)).toEqual([6, 8, 10]);
    expect(chordForBar(0, 2)).toEqual([2, 4, 6]);
    expect(chordForBar(0, 4)).toEqual([0, 2, 4]);
    expect(chordForBar(0, 6)).toEqual([3, 5, 7]);
    expect(chordForBar(0, 8)).toEqual(chordForBar(0, 0));
    for (let bar = 0; bar < 8; bar++) {
      for (const d of chordForBar(0, bar)) expect(inScale(freqForDegree(d))).toBe(true);
    }
  });
  it('la semilla cambia la canción: 200 semillas dan > 40 combinaciones (progresión, groove, rotación)', () => {
    const combos = new Set<string>();
    for (let s = 0; s < 200; s++) {
      const p = songProfile(s);
      combos.add([p.progression, p.groove, p.rotation].join('-'));
    }
    expect(combos.size).toBeGreaterThan(40);
  });
  it('la puntuación de calidad es estable y acotada 0..100', () => {
    expect(songScore(42)).toBe(songScore(42));
    for (const s of [0, 1, 7, 42, 1234]) {
      const score = songScore(s);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
  it('las semillas curadas superan la nota mínima y cubren estilos', () => {
    expect(CURATED_SONG_SEEDS.length).toBeGreaterThanOrEqual(18);
    const styles = new Set<string>();
    for (const seed of CURATED_SONG_SEEDS) {
      expect(songScore(seed)).toBeGreaterThanOrEqual(CURATED_MIN_SCORE);
      const p = songProfile(seed);
      styles.add(p.progression + '-' + p.groove);
    }
    expect(styles.size).toBe(18); // cobertura completa de progresión × groove
  });
  it('pickCuratedSeed devuelve siempre una semilla de la lista', () => {
    for (const v of [0, 1, -1, 999999, 123456789]) {
      expect(CURATED_SONG_SEEDS).toContain(pickCuratedSeed(v));
    }
    expect(pickCuratedSeed(42)).toBe(pickCuratedSeed(42)); // determinista
  });
  it('freqForDegree: la octava duplica la frecuencia', () => {
    expect(freqForDegree(0)).toBeCloseTo(ROOT_FREQ);
    expect(freqForDegree(7)).toBeCloseTo(ROOT_FREQ * 2);
  });
});

describe('mapeo intensidad → capas / tempo / brillo', () => {
  it('el pad suena siempre: a intensidad 0 no hay más capas', () => {
    expect(layersForIntensity(0)).toEqual({ bass: false, arpeggio: false, drums: false });
  });
  it('el bajo entra a partir de 0.2', () => {
    expect(layersForIntensity(THRESHOLD_BASS - 0.01).bass).toBe(false);
    expect(layersForIntensity(THRESHOLD_BASS).bass).toBe(true);
  });
  it('el arpegio entra a partir de 0.4 y la percusión a partir de 0.6', () => {
    expect(layersForIntensity(THRESHOLD_ARPEGIO - 0.01).arpeggio).toBe(false);
    expect(layersForIntensity(THRESHOLD_ARPEGIO).arpeggio).toBe(true);
    expect(layersForIntensity(THRESHOLD_DRUMS - 0.01).drums).toBe(false);
    expect(layersForIntensity(THRESHOLD_DRUMS).drums).toBe(true);
  });
  it('el tempo va de 70 a 100 BPM y es monótono', () => {
    expect(tempoFor(0)).toBe(BPM_MIN);
    expect(tempoFor(1)).toBe(BPM_MAX);
    expect(tempoFor(0.5)).toBeCloseTo((BPM_MIN + BPM_MAX) / 2);
    expect(tempoFor(2)).toBe(BPM_MAX); // clamped
    expect(tempoFor(0.3)).toBeLessThan(tempoFor(0.7));
  });
  it('el brillo (frecuencia de corte) sube con la intensidad', () => {
    expect(cutoffFor(0)).toBe(CUTOFF_MIN_HZ);
    expect(cutoffFor(1)).toBe(CUTOFF_MAX_HZ);
    expect(cutoffFor(0.3)).toBeLessThan(cutoffFor(0.8));
  });
  it('la densidad de notas crece desde el mínimo con la intensidad', () => {
    expect(maskDensityFor(THRESHOLD_ARPEGIO)).toBeCloseTo(MASK_DENSITY_MIN);
    expect(maskDensityFor(1)).toBe(1);
    expect(maskDensityFor(0.5)).toBeLessThan(maskDensityFor(0.9));
  });
});

describe('suavizado (IntensityTracker)', () => {
  it('arranca en calma y reset vuelve a cero', () => {
    const tr = new IntensityTracker();
    expect(tr.current).toBe(0);
    for (let t = 0; t < 2; t += 1 / 60) tr.update(1 / 60, ALL_ON);
    expect(tr.current).toBeGreaterThan(0.3);
    tr.reset();
    expect(tr.current).toBe(0);
  });
  it('un Tetris eleva la tensión sin saltos bruscos', () => {
    const tr = new IntensityTracker();
    tr.event('tetris');
    const v = tr.update(1 / 60, ALL_OFF);
    expect(v).toBeLessThan(0.35);
  });
  it('el pulso de eventos decae hacia la calma', () => {
    const tr = new IntensityTracker();
    tr.event('tetris');
    // La bajada es lenta por diseño (~4 s): tras 15 s el pulso ya se disipó.
    for (let t = 0; t < 15; t += 1 / 60) tr.update(1 / 60, ALL_OFF);
    expect(tr.current).toBeLessThan(0.05);
  });
  it('sube con rapidez hacia la acción y baja más despacio', () => {
    const up = new IntensityTracker();
    for (let t = 0; t < 2; t += 1 / 60) up.update(1 / 60, ALL_ON);
    const down = new IntensityTracker();
    for (let t = 0; t < 20; t += 1 / 60) down.update(1 / 60, ALL_ON);
    const top = down.current;
    for (let t = 0; t < 2; t += 1 / 60) down.update(1 / 60, ALL_OFF);
    expect(up.current).toBeGreaterThan(0.5);             // 2 s bastan para subir
    expect(top - down.current).toBeLessThan(up.current); // pero la bajada es más lenta
  });
});