import { describe, expect, it } from 'vitest';
import { TetrisEngine } from '../src/game/engine.js';
import {
  CLEAR_TYPE_BONUS,
  CLEAR_TYPE_LABEL,
  comboBonusFor,
} from '../src/game/types.js';

function seqRng(): () => number {
  let i = 0;
  return () => { i = (i + 1) % 100; return i / 100; };
}

/** Rellena una fila completamente para forzar un clear al hacer hardDrop. */
function fillRow(e: TetrisEngine, row: number, kind: 'I' | 'O' = 'I'): void {
  for (let c = 0; c < 10; c++) e.grid[row]![c] = kind;
}

describe('CLEAR_TYPE_BONUS', () => {
  it('single no tiene bonus adicional', () => {
    expect(CLEAR_TYPE_BONUS.single).toBe(0);
  });
  it('double tiene bonus de 50', () => {
    expect(CLEAR_TYPE_BONUS.double).toBe(50);
  });
  it('triple tiene bonus de 150', () => {
    expect(CLEAR_TYPE_BONUS.triple).toBe(150);
  });
  it('tetris tiene bonus de 400', () => {
    expect(CLEAR_TYPE_BONUS.tetris).toBe(400);
  });
});

describe('CLEAR_TYPE_LABEL', () => {
  it('tiene etiquetas en español para doble/triple/tetris', () => {
    expect(CLEAR_TYPE_LABEL.double).toBe('Doble');
    expect(CLEAR_TYPE_LABEL.triple).toBe('Triple');
    expect(CLEAR_TYPE_LABEL.tetris).toBe('TETRIS');
    expect(CLEAR_TYPE_LABEL.single).toBe('Single');
  });
});

describe('comboBonusFor', () => {
  it('combo 0 o negativo devuelve 0', () => {
    expect(comboBonusFor(0, 1)).toBe(0);
    expect(comboBonusFor(-1, 1)).toBe(0);
  });
  it('combo 1: solo base 50 × nivel', () => {
    expect(comboBonusFor(1, 1)).toBe(50);
    expect(comboBonusFor(1, 3)).toBe(150);
  });
  it('combo 2-4: base + 25 × nivel', () => {
    expect(comboBonusFor(2, 1)).toBe(50 * 2 + 25); // 125
    expect(comboBonusFor(4, 2)).toBe(50 * 4 * 2 + 25 * 2); // 450
  });
  it('combo 5-9: base + 50 × nivel', () => {
    expect(comboBonusFor(5, 1)).toBe(50 * 5 + 50); // 300
    expect(comboBonusFor(9, 3)).toBe(50 * 9 * 3 + 50 * 3); // 1500
  });
  it('combo 10+: base + 100 × nivel', () => {
    expect(comboBonusFor(10, 1)).toBe(50 * 10 + 100); // 600
    expect(comboBonusFor(12, 2)).toBe(50 * 12 * 2 + 100 * 2); // 1400
  });
});

describe('puntuación por tipo de clear', () => {
  it('single en nivel 1 da 100 puntos', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start();
    fillRow(e, 0);
    e.active = { kind: 'O', rotation: 0, x: 4, y: 4 };
    e.hardDrop();
    expect(e.score).toBe(106);
    expect(e.lines).toBe(1);
  });
  it('double en nivel 1 da (300 + 50) = 350 + hard drop', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start();
    fillRow(e, 0, 'I');
    fillRow(e, 1, 'I');
    e.active = { kind: 'I', rotation: 0, x: 4, y: 8 };
    e.hardDrop();
    // I cae 6 celdas (y=8 → y=2) = 12 pts hard drop + 350 pts double
    expect(e.score).toBe(362);
    expect(e.lines).toBe(2);
    // Primer clear: combo pasa de -1 a 0 (aún sin racha)
    expect(e.combo).toBe(0);
  });
  it('triple en nivel 1 da (500 + 150) = 650 + hard drop', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start();
    for (let r = 0; r < 3; r++) fillRow(e, r, 'I');
    e.active = { kind: 'I', rotation: 0, x: 4, y: 12 };
    e.hardDrop();
    // I cae 9 celdas (y=12 → y=3) = 18 pts hard drop + 650 pts triple
    expect(e.score).toBe(668);
    expect(e.lines).toBe(3);
  });
  it('tetris en nivel 1 da (800 + 400) = 1200 + hard drop', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start();
    for (let r = 0; r < 4; r++) fillRow(e, r, 'I');
    e.active = { kind: 'I', rotation: 0, x: 4, y: 16 };
    e.hardDrop();
    // I cae 12 celdas (y=16 → y=4) = 24 pts hard drop + 1200 pts tetris
    expect(e.score).toBe(1224);
    expect(e.lines).toBe(4);
  });
  it('double en nivel 3 da (300 + 50) × 3 = 1050 + hard drop', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start();
    e.level = 3;
    fillRow(e, 0, 'I');
    fillRow(e, 1, 'I');
    e.active = { kind: 'I', rotation: 0, x: 4, y: 8 };
    e.hardDrop();
    // I cae 6 celdas = 12 pts hard drop + 1050 pts double × nivel 3
    expect(e.score).toBe(1062);
  });
  it('combo de dos doubles consecutivos acumula bono escalonado', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start();
    fillRow(e, 0, 'I');
    fillRow(e, 1, 'I');
    e.active = { kind: 'I', rotation: 0, x: 4, y: 8 };
    e.hardDrop();
    const scoreAfterFirst = e.score;
    // Primer clear: combo = 0 (aún sin racha)
    expect(e.combo).toBe(0);
    // scoreAfterFirst = 12 (hard drop) + 350 (double base) = 362
    fillRow(e, 0, 'I');
    fillRow(e, 1, 'I');
    e.active = { kind: 'I', rotation: 0, x: 4, y: 8 };
    e.hardDrop();
    // Segundo clear: combo = 1 (primera racha)
    // (300 + 50) × 1 + comboBonusFor(1, 1) = 350 + 50 = 400 + 12 hard drop = 412
    expect(e.combo).toBe(1);
    expect(e.score).toBe(scoreAfterFirst + 412);
  });
});

describe('eventos emitidos incluyen clearType y comboCount', () => {
  it('evento clear tiene clearType y comboCount', () => {
    const events: any[] = [];
    const e = new TetrisEngine({
      rng: seqRng(),
      onEvent: (ev) => events.push(ev),
    });
    e.start();
    fillRow(e, 0, 'I');
    fillRow(e, 1, 'I');
    e.active = { kind: 'I', rotation: 0, x: 4, y: 8 };
    e.hardDrop();
    const clearEvent = events.find((ev) => ev.type === 'clear');
    expect(clearEvent).toBeDefined();
    expect(clearEvent.clearType).toBe('double');
    expect(clearEvent.lines).toBe(2);
    // Primer clear: combo = 0 (aún sin racha)
    expect(clearEvent.comboCount).toBe(0);
    // scoreGained = (300 + 50) × 1 + comboBonusFor(0, 1) = 350 + 0 = 350
    expect(clearEvent.scoreGained).toBe(350);
  });
  it('evento combo tiene comboCount y comboBonus', () => {
    const events: any[] = [];
    const e = new TetrisEngine({
      rng: seqRng(),
      onEvent: (ev) => events.push(ev),
    });
    e.start();
    fillRow(e, 0, 'I');
    e.active = { kind: 'O', rotation: 0, x: 4, y: 4 };
    e.hardDrop();
    fillRow(e, 0, 'I');
    e.active = { kind: 'O', rotation: 0, x: 4, y: 4 };
    e.hardDrop();
    const comboEvents = events.filter((ev) => ev.type === 'combo');
    expect(comboEvents.length).toBeGreaterThan(0);
    const lastCombo = comboEvents[comboEvents.length - 1];
    // Segundo clear: combo = 1 (primera racha real)
    expect(lastCombo.comboCount).toBe(1);
    expect(lastCombo.comboBonus).toBe(comboBonusFor(1, 1));
  });
});