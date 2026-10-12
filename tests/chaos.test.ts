import { describe, expect, it } from 'vitest';
import { TetrisEngine } from '../src/game/engine.js';
import { createGrid } from '../src/game/board.js';
import type { GameEvent } from '../src/game/types.js';

function seqRng(): () => number { let i = 0; return () => { i = (i + 1) % 100; return i / 100; }; }

/** Rellena filas completas [from, to] con bloques (columna 9 vacia: sin lineas completas). */
function fillRows(e: TetrisEngine, from: number, to: number): void {
  for (let y = from; y <= to; y++) for (let x = 0; x < 9; x++) e.grid[y]![x] = 'I';
}

describe('classic intacto', () => {
  it('no crea especiales ni usa caos por defecto', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start();
    expect(e.mode).toBe('classic');
    expect(e.special).toBeNull();
    expect(e.peekSpecial()).toBeNull();
    expect(e.result().mode).toBe('classic');
  });
});

describe('piezas especiales (modo caos)', () => {
  it('misma semilla => misma secuencia de especiales', () => {
    const run = (seed: number): Array<string | null> => {
      const e = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed });
      e.start();
      const out: Array<string | null> = [];
      for (let i = 0; i < 30; i++) {
        out.push(e.special);
        e.grid = createGrid(); // piso artificial para no perder por overflow
        e.hardDrop();
      }
      return out;
    };
    expect(run(1234)).toEqual(run(1234));
    expect(run(1234).some((s) => s !== null)).toBe(true);
    expect(run(1234)).not.toEqual(run(999));
  });

  it('el preview anuncia el especial de la proxima pieza', () => {
    const e = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed: 1234 });
    e.start();
    let announcedAtLeastOnce = false;
    for (let i = 0; i < 30; i++) {
      const announced = e.peekSpecial();
      e.grid = createGrid();
      e.hardDrop();
      if (e.phase !== 'playing') break;
      expect(e.special).toBe(announced);
      if (announced !== null) announcedAtLeastOnce = true;
    }
    expect(announcedAtLeastOnce).toBe(true);
  });

  it('bomba: revienta 2 filas al bloquearse y la pieza se consume', () => {
    const events: GameEvent[] = [];
    const e = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed: 3, onEvent: (ev) => events.push(ev) });
    e.start();
    fillRows(e, 0, 3); // monton hasta la fila 3
    e.active = { kind: 'I', rotation: 0, x: 2, y: 12 };
    e.special = 'bomb';
    e.hardDrop(); // la I aterriza sobre la fila 4
    const bomb = events.find((ev) => ev.type === 'bomb');
    expect(bomb?.rows?.slice().sort((a, b) => a - b)).toEqual([3, 4]);
    for (const y of [3, 4]) expect(e.grid[y]!.every((v) => v === 0)).toBe(true);
    expect(e.grid[0]![0]).toBe('I');
    expect(e.grid[2]![0]).toBe('I');
  });

  it('rayo: rompe los 4 bloques mas altos bajo la pieza', () => {
    const events: GameEvent[] = [];
    const e = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed: 4, onEvent: (ev) => events.push(ev) });
    e.start();
    fillRows(e, 0, 2); // monton hasta la fila 2
    e.active = { kind: 'O', rotation: 0, x: 5, y: 10 };
    e.special = 'bolt';
    e.hardDrop(); // la O aterriza sobre la fila 3
    const bolt = events.find((ev) => ev.type === 'bolt');
    const broken = (bolt?.cells ?? []).map((c) => c.x + ',' + c.y).sort();
    expect(broken).toEqual(['5,1', '5,2', '6,1', '6,2']);
    // Las columnas de fuera no se tocan y el rayo no deja pieza detras.
    expect(e.grid[2]![0]).toBe('I');
    expect(e.grid[0]![0]).toBe('I');
    expect(e.grid[3]![5]).toBe(0);
    expect(e.grid[4]![5]).toBe(0);
  });

  it('rayo: sin bloques debajo no rompe nada', () => {
    const events: GameEvent[] = [];
    const e = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed: 4, onEvent: (ev) => events.push(ev) });
    e.start();
    e.active = { kind: 'O', rotation: 0, x: 5, y: 2 };
    e.special = 'bolt';
    e.hardDrop(); // cae al suelo sin nada debajo
    expect(events.some((ev) => ev.type === 'bolt')).toBe(false);
    expect(e.grid[0]![0]).toBe(0); // el tablero sigue vacio salvo la propia pieza
  });

  it('taladro: se hunde 2 filas destruyendo los bloques bajo su base', () => {
    const events: GameEvent[] = [];
    const e = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed: 4, onEvent: (ev) => events.push(ev) });
    e.start();
    fillRows(e, 0, 5); // monton hasta la fila 5
    e.active = { kind: 'O', rotation: 0, x: 5, y: 6 }; // la O descansa sobre la fila 5
    e.special = 'drill';
    expect(e.drillSink()).toBe(true);
    expect(e.active?.y).toBe(4); // se hunde 2 filas (de y=6 a y=4)
    const drill = events.find((ev) => ev.type === 'drill');
    const bored = (drill?.cells ?? []).map((c) => c.x + ',' + c.y).sort();
    expect(bored).toEqual(['5,4', '5,5', '6,4', '6,5']);
    expect(e.grid[5]![5]).toBe(0);
    expect(e.grid[4]![5]).toBe(0);
    expect(e.grid[3]![5]).toBe('I'); // debajo del hueco, el monton sigue
    expect(e.special).toBe('drill'); // sigue siendo el objeto hasta fijarse
    expect(e.drillSink()).toBe(false); // una sola vez por pieza
    e.hardDrop(); // se fija y el powerup se consume...
    expect(e.grid[5]![5]).toBe(0); // ...sin dejar bloques de pieza convencional
    expect(e.grid[4]![5]).toBe(0);
  });

  it('taladro: en el suelo no se hunde', () => {
    const e = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed: 4 });
    e.start();
    e.active = { kind: 'O', rotation: 0, x: 5, y: 0 };
    e.special = 'drill';
    expect(e.drillSink()).toBe(false);
    expect(e.active?.y).toBe(0);
  });

  it('el especial viaja con la pieza al holdear', () => {
    const e = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed: 5 });
    e.start();
    e.holdKind = 'I'; e.holdSpecial = 'drill';
    e.active = { kind: 'T', rotation: 0, x: 5, y: 10 };
    e.special = 'bomb';
    e.hold();
    expect(e.active?.kind).toBe('I');
    expect(e.special).toBe('drill');
    expect(e.holdKind).toBe('T');
    expect(e.holdSpecial).toBe('bomb');
  });

  it('settleColumns compacta columnas (tras bomba/rayo)', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start();
    e.grid[0]![0] = 'I'; e.grid[2]![0] = 'T';
    const moved = e.settleColumns();
    expect(moved).toBe(true);
    expect(e.grid[0]![0]).toBe('I');
    expect(e.grid[1]![0]).toBe('T');
  });
});