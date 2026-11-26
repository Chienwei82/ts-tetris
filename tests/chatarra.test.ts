import { describe, expect, it } from 'vitest';
import { TetrisEngine } from '../src/game/engine.js';
import type { GameEvent } from '../src/game/types.js';

function seqRng(): () => number { let i = 0; return () => { i = (i + 1) % 100; return i / 100; }; }

function countJunk(e: TetrisEngine): number {
  let count = 0;
  for (const row of e.grid) for (const cell of row) if (cell === 'X') count++;
  return count;
}

describe('pieza desventajosa Chatarra (Caos)', () => {
  it('deja 4 bloques de basura y no da puntos', () => {
    const events: GameEvent[] = [];
    const e = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed: 8, onEvent: (ev) => events.push(ev) });
    e.start();
    e.active = { kind: 'O', rotation: 0, x: 5, y: 0 };
    e.special = 'chatarra';
    e.hardDrop();

    expect(countJunk(e)).toBe(4);
    const junk = events.find((ev) => ev.type === 'junk');
    expect(junk?.cells).toHaveLength(4);
    expect(e.score).toBe(0);
    expect(e.special).toBeNull();
    // La pieza no deja bloques de su color: solo la chatarra.
    expect(e.grid[0]?.[5]).toBe('X');
  });

  it('la pieza J no se confunde con la chatarra', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start();
    e.active = { kind: 'J', rotation: 0, x: 4, y: 0 };
    e.hardDrop();
    expect(countJunk(e)).toBe(0);
    expect(e.grid[0]![3]).toBe('J');
  });

  it('la guía anuncia las celdas donde aparecerá la basura', () => {
    const e = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed: 8 });
    e.start();
    e.active = { kind: 'O', rotation: 0, x: 5, y: 8 };
    e.special = 'chatarra';
    const preview = e.specialPreview();
    expect(preview?.kind).toBe('chatarra');
    expect(preview?.cells).toHaveLength(4);
    expect(preview?.rows).toEqual([]);
  });

  it('la basura se puede limpiar al completar la línea', () => {
    const e = new TetrisEngine({ rng: seqRng(), mode: 'chaos', seed: 8 });
    e.start();
    // Filas 0 y 1 con 8 bloques + chatarra de 4 celdas (O) => líneas completas.
    for (let x = 0; x < 8; x++) { e.grid[0]![x] = 'I'; e.grid[1]![x] = 'I'; }
    e.active = { kind: 'O', rotation: 0, x: 8, y: 0 };
    e.special = 'chatarra';
    e.hardDrop();
    expect(countJunk(e)).toBe(4);
    // Las líneas completas se limpian al fijar la siguiente pieza normal.
    e.special = null;
    e.hardDrop();
    expect(countJunk(e)).toBe(0);
    expect(e.lines).toBe(2);
  });
});
