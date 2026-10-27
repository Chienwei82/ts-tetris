import { describe, expect, it } from 'vitest';
import { TetrisEngine } from '../src/game/engine.js';
import { MutatorDirector } from '../src/game/mutators/director.js';
import type { MutatorEvent, MutatorHost, WindDir } from '../src/game/mutators/types.js';

function seqRng(): () => number { let i = 0; return () => { i = (i + 1) % 100; return i / 100; }; }

class RecordingHost implements MutatorHost {
  pushes: WindDir[] = [];
  slippery = false;
  allow = true;
  lightningStrikes: { x: number; y: number }[][] = [];
  hailDrops: number[][] = [];
  melts = 0;
  pushWind(dir: WindDir): boolean {
    if (!this.allow) return false;
    this.pushes.push(dir);
    return true;
  }
  setSlippery(on: boolean): void { this.slippery = on; }
  lightningStrike(cells: { x: number; y: number }[]): void { this.lightningStrikes.push(cells); }
  dropHail(columns: number[]): void { this.hailDrops.push(columns); }
  meltHail(): void { this.melts++; }
  occupiedColumns(): number[] { return [0, 1, 2]; }
  topCell(_col: number): number { return 0; }
}

describe('MutatorDirector (lógica pura)', () => {
  it('avisa con la flecha al menos 1 s antes de cada empuje de viento', () => {
    const host = new RecordingHost();
    const events: Array<{ t: number; e: MutatorEvent }> = [];
    let t = 0;
    const director = new MutatorDirector({
      seed: 7, enabled: true, host,
      config: {
        pool: ['wind'], firstDelaySec: 0, warnSec: 0, activeSec: 20,
        windWarnSec: 1.2, windFirstGustSec: 3, windIntervalSec: 20
      },
      onEvent: (e) => events.push({ t, e })
    });
    for (let i = 0; i < 200 && !events.some((x) => x.e.kind === 'wind-gust'); i++) {
      t += 0.05;
      director.update(0.05);
    }
    const warn = events.find((x) => x.e.kind === 'wind-warn');
    const gust = events.find((x) => x.e.kind === 'wind-gust');
    expect(warn).toBeDefined();
    expect(gust).toBeDefined();
    expect(gust!.t - warn!.t).toBeGreaterThanOrEqual(1.2 - 0.051);
    expect(events.map((x) => x.e.kind).slice(0, 4)).toEqual(['warn', 'start', 'wind-warn', 'wind-gust']);
    expect(director.config.windWarnSec).toBeGreaterThanOrEqual(1);
  });

  it('misma semilla => misma secuencia; alterna tormentas y no repite', () => {
    const run = (seed: number): string[] => {
      const out: string[] = [];
      const director = new MutatorDirector({
        seed, enabled: true, host: new RecordingHost(),
        config: { firstDelaySec: 0.5, warnSec: 0.3, activeSec: 2, cooldownSec: 0.4, windIntervalSec: 1, windFirstGustSec: 1 },
        onEvent: (e) => out.push(e.kind + ':' + ('mutator' in e ? e.mutator : '') + ':' + ('dir' in e ? e.dir : ''))
      });
      for (let i = 0; i < 300; i++) director.update(0.05);
      return out;
    };
    const a = run(1234);
    expect(a).toEqual(run(1234));
    expect(a.some((s) => s.includes('wind'))).toBe(true);
    expect(a.some((s) => s.includes('rain'))).toBe(true);
    const starts = a.filter((s) => s.startsWith('start:'));
    for (let i = 1; i < starts.length; i++) expect(starts[i]).not.toBe(starts[i - 1]);
  });

  it('lluvia: activa y desactiva el suelo resbaladizo', () => {
    const host = new RecordingHost();
    const director = new MutatorDirector({
      seed: 3, enabled: true, host,
      config: { pool: ['rain'], firstDelaySec: 0, warnSec: 0.2, activeSec: 1, cooldownSec: 5 }
    });
    director.update(0.1); // warn
    director.update(0.3); // start
    expect(host.slippery).toBe(true);
    expect(director.isActive('rain')).toBe(true);
    director.update(1.1); // end
    expect(host.slippery).toBe(false);
    expect(director.activeMutator).toBeNull();
  });

  it('sin pool o desactivado no emite nada', () => {
    const events: MutatorEvent[] = [];
    const off = new MutatorDirector({ seed: 1, enabled: false, host: new RecordingHost(), onEvent: (e) => events.push(e) });
    for (let i = 0; i < 200; i++) off.update(0.1);
    const empty = new MutatorDirector({ seed: 1, enabled: true, host: new RecordingHost(), config: { pool: [] }, onEvent: (e) => events.push(e) });
    for (let i = 0; i < 200; i++) empty.update(0.1);
    expect(events).toHaveLength(0);
  });
});

describe('motor: tormentas del Caos', () => {
  it('Tradicional queda intacto: sin tormentas y sin deslizamiento', () => {
    const events: MutatorEvent[] = [];
    const e = new TetrisEngine({
      rng: seqRng(), mode: 'classic', seed: 9,
      onMutatorEvent: (ev) => events.push(ev),
      mutatorConfig: { pool: ['rain'], firstDelaySec: 0, warnSec: 0, activeSec: 5 }
    });
    e.start();
    for (let i = 0; i < 100; i++) e.update(0.1);
    expect(events).toHaveLength(0);
    expect(e.slippery).toBe(false);
    e.active = { kind: 'O', rotation: 0, x: 2, y: 10 };
    expect(e.move(1)).toBe(true);
    expect(e.active.x).toBe(3);
  });
});

describe('motor: lluvia resbaladiza', () => {
  it('tras mover lateralmente desliza una celda extra (misma acción)', () => {
    const e = new TetrisEngine({
      rng: seqRng(), mode: 'chaos', seed: 11,
      mutatorConfig: { pool: ['rain'], firstDelaySec: 0, warnSec: 0, activeSec: 60 }
    });
    e.start();
    e.active = { kind: 'O', rotation: 0, x: 2, y: 10 };
    e.special = null;
    e.update(0.01); // aviso
    e.update(0.01); // empieza a llover
    expect(e.slippery).toBe(true);
    const v = e.pieceVersion;
    expect(e.move(1)).toBe(true);
    expect(e.active?.x).toBe(4);
    expect(e.pieceVersion).toBe(v + 1); // un solo evento/versión por acción
  });

  it('si la celda extra está bloqueada solo avanza una', () => {
    const e = new TetrisEngine({
      rng: seqRng(), mode: 'chaos', seed: 12,
      mutatorConfig: { pool: ['rain'], firstDelaySec: 0, warnSec: 0, activeSec: 60 }
    });
    e.start();
    e.active = { kind: 'O', rotation: 0, x: 7, y: 10 };
    e.special = null;
    e.update(0.01);
    e.update(0.01);
    expect(e.move(1)).toBe(true);
    expect(e.active?.x).toBe(8); // 7→8 y el deslizamiento a 9 está fuera
    expect(e.move(1)).toBe(false); // ya pegada al muro
  });

  it('al terminar la tormenta el suelo vuelve a agarrar', () => {
    const events: MutatorEvent[] = [];
    const e = new TetrisEngine({
      rng: seqRng(), mode: 'chaos', seed: 13,
      onMutatorEvent: (ev) => events.push(ev),
      mutatorConfig: { pool: ['rain'], firstDelaySec: 0, warnSec: 0, activeSec: 0.2, cooldownSec: 5 }
    });
    e.start();
    e.update(0.01);
    e.update(0.01);
    expect(e.slippery).toBe(true);
    e.update(0.25);
    expect(e.slippery).toBe(false);
    expect(events.some((ev) => ev.kind === 'end' && ev.mutator === 'rain')).toBe(true);
  });
});

describe('motor: viento', () => {
  it('el director empuja la pieza una celda en la dirección avisada', () => {
    const events: MutatorEvent[] = [];
    const e = new TetrisEngine({
      rng: seqRng(), mode: 'chaos', seed: 21,
      onMutatorEvent: (ev) => events.push(ev),
      mutatorConfig: {
        pool: ['wind'], firstDelaySec: 0, warnSec: 0, activeSec: 30,
        windWarnSec: 1, windFirstGustSec: 1.2, windIntervalSec: 30
      }
    });
    e.start();
    e.active = { kind: 'O', rotation: 0, x: 4, y: 10 };
    e.special = null;
    for (let i = 0; i < 100 && !events.some((ev) => ev.kind === 'wind-gust'); i++) e.update(0.05);
    const warn = events.find((ev) => ev.kind === 'wind-warn');
    const gust = events.find((ev) => ev.kind === 'wind-gust');
    expect(warn).toBeDefined();
    expect(gust).toBeDefined();
    if (!warn || warn.kind !== 'wind-warn' || !gust || gust.kind !== 'wind-gust') return;
    expect(gust.dir).toBe(warn.dir);
    expect(gust.moved).toBe(true);
    expect(e.active?.x).toBe(4 + gust.dir);
  });

  it('con lluvia el viento sigue empujando solo una celda', () => {
    const e = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed: 23 });
    e.start();
    e.active = { kind: 'O', rotation: 0, x: 3, y: 10 };
    e.setSlippery(true);
    expect(e.pushWind(1)).toBe(true);
    expect(e.active?.x).toBe(4);
  });

  it('contra la pared el empuje no mueve la pieza', () => {
    const e = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed: 22 });
    e.start();
    e.active = { kind: 'O', rotation: 0, x: 8, y: 10 };
    e.special = null;
    expect(e.pushWind(1)).toBe(false);
    expect(e.active?.x).toBe(8);
    expect(e.pushWind(-1)).toBe(true);
    expect(e.active?.x).toBe(7);
  });

  it('misma semilla => mismas tormentas y mismo resultado', () => {
    const run = (seed: number): string => {
      const log: MutatorEvent[] = [];
      const e = new TetrisEngine({
        rng: seqRng(), mode: 'chaos', seed,
        onMutatorEvent: (ev) => log.push(ev),
        mutatorConfig: {
          firstDelaySec: 0.5, warnSec: 0.3, activeSec: 2, cooldownSec: 0.4,
          windIntervalSec: 1, windFirstGustSec: 1.2, windWarnSec: 1
        }
      });
      e.start();
      for (let i = 0; i < 300; i++) e.update(0.05);
      return JSON.stringify({
        log,
        active: e.active,
        lines: e.lines,
        score: e.score,
        grid: e.grid.map((row) => row.join('')).join('|')
      });
    };
    expect(run(1234)).toBe(run(1234));
    expect(run(1234)).not.toBe(run(999));
  });
});
describe('MutatorDirector lightning/hail', () => {
  it('lightning: avisa, empieza y dispara rayo determinista', () => {
    const host = new RecordingHost();
    const events: MutatorEvent[] = [];
    const d = new MutatorDirector({
      seed: 1,
      enabled: true,
      host,
      config: { pool: ['lightning'], firstDelaySec: 0, warnSec: 0.1, activeSec: 5, cooldownSec: 0.1, lightningFirstStrikeSec: 0.5, lightningIntervalSec: 5, lightningBreaks: 2 },
      onEvent: (e) => events.push(e)
    });
    d.update(0.1);
    d.update(0.1);
    expect(events.some((e) => e.kind === 'start' && e.mutator === 'lightning')).toBe(true);
    d.update(0.5);
    expect(host.lightningStrikes.length).toBe(1);
    expect(host.lightningStrikes[0]).toHaveLength(2);
    expect(events.some((e) => e.kind === 'lightning')).toBe(true);
  });

  it('hail: deja granizo y lo derrite tras meltSec', () => {
    const host = new RecordingHost();
    const events: MutatorEvent[] = [];
    const d = new MutatorDirector({
      seed: 2,
      enabled: true,
      host,
      config: { pool: ['hail'], firstDelaySec: 0, warnSec: 0.1, activeSec: 5, cooldownSec: 0.1, hailFirstFallSec: 0.5, hailIntervalSec: 5, hailMeltSec: 0.3 },
      onEvent: (e) => events.push(e)
    });
    d.update(0.1);
    d.update(0.1);
    expect(events.some((e) => e.kind === 'start' && e.mutator === 'hail')).toBe(true);
    d.update(0.5);
    expect(host.hailDrops.length).toBe(1);
    expect(events.some((e) => e.kind === 'hail')).toBe(true);
    d.update(0.3);
    expect(host.melts).toBe(1);
  });
});
