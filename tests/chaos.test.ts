import { describe, expect, it } from 'vitest';
import { TetrisEngine } from '../src/game/engine.js';
import { ChaosDirector } from '../src/game/chaos/director.js';
import type { ChaosEvent } from '../src/game/chaos/types.js';
import { registerAllChaosModules } from '../src/game/chaos/mutators.js';
import { clearChaosRegistry } from '../src/game/chaos/registry.js';

function seqRng(): () => number { let i = 0; return () => { i = (i + 1) % 100; return i / 100; }; }

describe('classic intacto', () => {
  it('no crea director ni usa caos por defecto', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start();
    expect(e.mode).toBe('classic');
    expect(e.chaos).toBeNull();
    expect(e.result().mode).toBe('classic');
  });
});

describe('chaos director (sin navegador)', () => {
  it('misma semilla => misma secuencia de mutadores', () => {
    clearChaosRegistry(); registerAllChaosModules();
    const run = (seed: number): string[] => {
      const events: ChaosEvent[] = [];
      const eng = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed });
      eng.start();
      const d = new ChaosDirector({ seed, config: { linesPerMutator: 1 }, onEvent: (e) => events.push(e) });
      d.attach(eng);
      for (let i = 0; i < 40; i++) { eng.lines += 1; d.update(0.5); d.update(0.6); }
      return events.filter((e) => e.kind === 'warn' && e.moduleId.startsWith('mut-')).map((e) => e.moduleId);
    };
    expect(run(1234)).toEqual(run(1234));
    expect(run(1234).length).toBeGreaterThan(0);
  });
  it('avisa 1s antes y solo un mutador a la vez', () => {
    clearChaosRegistry(); registerAllChaosModules();
    const events: ChaosEvent[] = [];
    const eng = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed: 7 });
    eng.start();
    const d = new ChaosDirector({ seed: 7, config: { linesPerMutator: 1, mutatorWarnSec: 1, garbageIntervalSec: 9999, tremorIntervalSec: 9999 }, onEvent: (e) => events.push(e) });
    d.attach(eng);
    eng.lines += 1;
    d.update(0.4);
    expect(events.some((e) => e.kind === 'warn' && e.remainingSec === 1)).toBe(true);
    d.update(0.7); // warnLeft 1 -> 0.3, aun avisando
    expect(d.activeName()).toBeNull();
    d.update(0.4); // warnLeft 0.3 -> -0.1, dispara
    expect(events.some((e) => e.kind === 'start')).toBe(true);
    expect(d.activeName()).not.toBeNull();
  });
  it('piezas especiales reproducibles por semilla', () => {
    clearChaosRegistry(); registerAllChaosModules();
    const run = (seed: number): Array<string | null> => {
      const eng = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed });
      eng.start();
      const d = new ChaosDirector({ seed, onEvent: () => undefined });
      d.attach(eng);
      const out: Array<string | null> = [];
      for (let i = 0; i < 30; i++) out.push(eng.chaos?.nextSpecial?.() ?? null);
      return out;
    };
    expect(run(555)).toEqual(run(555));
    expect(run(555).some((s) => s !== null)).toBe(true);
  });
  it('expone countdown via tick', () => {
    clearChaosRegistry(); registerAllChaosModules();
    const events: ChaosEvent[] = [];
    const eng = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed: 9 });
    eng.start();
    const d = new ChaosDirector({ seed: 9, config: { linesPerMutator: 1, mutatorMinSec: 15, mutatorMaxSec: 15, garbageIntervalSec: 9999, tremorIntervalSec: 9999 }, onEvent: (e) => events.push(e) });
    d.attach(eng);
    eng.lines += 1; d.update(1.2); // crea el aviso (warnLeft=1)
    d.update(1); // warnLeft -> 0, dispara start
    expect(events.some((e) => e.kind === 'start')).toBe(true);
    d.update(1); // modulo activo emite tick con countdown
    expect(events.some((e) => e.kind === 'tick' && (e.remainingSec ?? 0) > 0)).toBe(true);
  });
});

describe('mecanicas caos en el motor', () => {
  it('bomba borra area 3x3 al fijar', () => {
    const e = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed: 1 });
    e.start();
    e.grid[0]![8] = 'I';
    e.active = { kind: 'O', rotation: 0, x: 4, y: 4 };
    e.special = 'bomb';
    e.hardDrop();
    // La bomba borra el area 3x3 del impacto (incluidas sus propias celdas);
    // la celda lejana (8,0) sobrevive.
    expect(e.grid[0]![8]).toBe('I');
    expect(e.grid[0]![4]).toBe(0);
    expect(e.grid[1]![5]).toBe(0);
  });
  it('rayo borra la fila de aterrizaje', () => {
    const e = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed: 2 });
    e.start();
    for (let c = 0; c < 10; c++) if (c !== 0 && c !== 1) e.grid[0]![c] = 'I';
    e.active = { kind: 'O', rotation: 0, x: 0, y: 4 };
    e.special = 'bolt';
    e.hardDrop();
    expect(e.grid[0]!.every((v) => v === 0)).toBe(true);
  });
  it('comodin monomino: una sola celda sin rotacion', () => {
    const e = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed: 3 });
    e.start();
    e.active = { kind: 'T', rotation: 0, x: 5, y: 10 };
    e.special = 'wild';
    e.activeSingle = true;
    expect(e.activeCells()).toHaveLength(1);
    e.rotate(1);
    expect(e.activeCells()).toHaveLength(1);
  });
  it('taladro perfora 1 celda y sigue cayendo', () => {
    const e = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed: 4 });
    e.start();
    e.grid[4]![5] = 'I'; // justo debajo de la celda (5,5) de la pieza
    e.active = { kind: 'O', rotation: 0, x: 4, y: 5 };
    e.special = 'drill';
    const before = e.activeCells()[0]!.y;
    const drilled = e.drillStep();
    expect(drilled).toBe(true);
    expect(e.grid[4]![5]).toBe(0);
    expect(e.special).toBeNull();
    expect(e.activeCells()[0]!.y).toBeLessThan(before);
  });
  it('basura sube con hueco y temblor desplaza con wrap', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start();
    e.pushGarbage(1, () => 3);
    const top = e.grid[e.grid.length - 1]!;
    expect(top[3]).toBe(0);
    expect(top.filter((v) => v !== 0).length).toBe(9);
    e.grid[0] = ['I', 0, 0, 0, 0, 0, 0, 0, 0, 0];
    e.shiftRow(0, 1);
    expect(e.grid[0]![1]).toBe('I');
  });
  it('cascada compacta columnas', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start();
    e.grid[0]![0] = 'I'; e.grid[2]![0] = 'T';
    const moved = e.settleColumns();
    expect(moved).toBe(true);
    expect(e.grid[0]![0]).toBe('I');
    expect(e.grid[1]![0]).toBe('T');
  });
});
