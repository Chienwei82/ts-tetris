import { describe, expect, it } from 'vitest';
import { clearSummary } from '../src/ui/clearSummary.js';

describe('resumen del aviso de clear', () => {
  it('un Tetris se titula y suma los puntos', () => {
    const s = clearSummary({ clearType: 'tetris', lines: 4, comboCount: 0, scoreGained: 1200 });
    expect(s.title).toBe('¡TETRIS!');
    expect(s.detail).toBe('+1200');
  });

  it('añade el combo al desglose a partir de la segunda limpieza', () => {
    const s = clearSummary({ clearType: 'double', lines: 2, comboCount: 3, scoreGained: 450 });
    expect(s.title).toBe('¡DOBLE!');
    expect(s.detail).toBe('+450 · Combo x3');
  });

  it('un combo x1 no se anuncia', () => {
    const s = clearSummary({ clearType: 'triple', lines: 3, comboCount: 1, scoreGained: 700 });
    expect(s.detail).toBe('+700');
  });

  it('un single se lee como línea y no grita', () => {
    const s = clearSummary({ clearType: 'single', lines: 1, comboCount: 0, scoreGained: 100 });
    expect(s.title).toBe('Línea');
    expect(s.detail).toBe('+100');
  });

  it('sin puntos usa la etiqueta del clear como detalle', () => {
    const s = clearSummary({ clearType: 'double', lines: 2, comboCount: 0, scoreGained: 0 });
    expect(s.title).toBe('¡DOBLE!');
    expect(s.detail).toBe('Doble');
  });
});
