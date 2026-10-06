import { describe, expect, it } from 'vitest';
import { PieceGesture, TAP_MAX_S, TAP_SLOP_PX } from '../src/ui/pieceDrag.js';

/** 20 px por celda para hacer las cuentas a mano. */
const CELL = { x: 20, y: 20 };

describe('PieceGesture', () => {
  it('convierte el arrastre horizontal en pasos de celda conservando el resto', () => {
    const g = new PieceGesture();
    g.press(0, 0, 0);
    expect(g.move(48, 0, CELL)).toEqual({ dx: 2, dy: 0 }); // 2.4 celdas → 2 pasos
    expect(g.move(60, 0, CELL)).toEqual({ dx: 1, dy: 0 }); // resto 0.4 + 0.6 → 1
    expect(g.move(62, 0, CELL)).toEqual({ dx: 0, dy: 0 });
  });

  it('arrastrar a la izquierda emite pasos negativos', () => {
    const g = new PieceGesture();
    g.press(0, 0, 0);
    expect(g.move(-48, 0, CELL)).toEqual({ dx: -2, dy: 0 });
    expect(g.move(-60, 0, CELL)).toEqual({ dx: -1, dy: 0 });
  });

  it('arrastrar hacia abajo emite caída suave celda a celda', () => {
    const g = new PieceGesture();
    g.press(0, 0, 0);
    expect(g.move(0, 45, CELL)).toEqual({ dx: 0, dy: 2 });
    expect(g.move(0, -25, CELL)).toEqual({ dx: 0, dy: 0 }); // subir no retrocede la pieza
  });

  it('la caída sigue la profundidad máxima del dedo (sin dobles con temblor)', () => {
    const g = new PieceGesture();
    g.press(0, 0, 0);
    expect(g.move(0, -50, CELL)).toEqual({ dx: 0, dy: 0 }); // subir nunca emite
    expect(g.move(0, 30, CELL)).toEqual({ dx: 0, dy: 1 }); // profundidad 30 → 1 celda
    expect(g.move(0, 5, CELL)).toEqual({ dx: 0, dy: 0 }); // retrocede: nada
    expect(g.move(0, 45, CELL)).toEqual({ dx: 0, dy: 1 }); // nueva profundidad → 1 más
  });

  it('un toque breve y quieto cierra como tap', () => {
    const g = new PieceGesture();
    g.press(100, 100, 1);
    expect(g.move(100 + TAP_SLOP_PX, 100, CELL)).toEqual({ dx: 0, dy: 0 });
    expect(g.release(1 + TAP_MAX_S)).toBe(true);
  });

  it('si el dedo se desplaza, soltar no rota', () => {
    const g = new PieceGesture();
    g.press(0, 0, 0);
    g.move(TAP_SLOP_PX + 1, 0, CELL);
    expect(g.release(0.1)).toBe(false);
  });

  it('un toque lento no cuenta como tap', () => {
    const g = new PieceGesture();
    g.press(0, 0, 0);
    expect(g.release(TAP_MAX_S + 0.05)).toBe(false);
  });

  it('cancelar un gesto deja la máquina lista para el siguiente', () => {
    const g = new PieceGesture();
    g.press(0, 0, 0);
    g.cancel();
    expect(g.isActive()).toBe(false);
    expect(g.release(0)).toBe(false);
    g.press(50, 50, 2);
    expect(g.release(2.1)).toBe(true);
  });
});