import { describe, expect, it } from 'vitest';
import { MOTIF_LABEL, PIECE_MOTIFS, drawPieceMotif, motifSignature } from '../src/render/pieceMotifs.js';
import { ALL_KINDS } from '../src/game/types.js';

/** Contexto 2D falso: registra llamadas sin necesitar canvas en Node. */
function fakeCtx() {
  const calls: string[] = [];
  const alphaStack: number[] = [];
  /** Alpha efectivo al empezar cada forma: sirve para probar el recorte 0..1. */
  const drawAlphas: number[] = [];
  const ctx = {
    globalAlpha: 1,
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    save(): void { alphaStack.push(ctx.globalAlpha); calls.push('save'); },
    restore(): void { ctx.globalAlpha = alphaStack.pop() ?? 1; calls.push('restore'); },
    beginPath: () => { drawAlphas.push(ctx.globalAlpha); calls.push('begin'); },
    moveTo: () => calls.push('moveTo'),
    lineTo: () => calls.push('lineTo'),
    arc: () => calls.push('arc'),
    stroke: () => calls.push('stroke'),
    fill: () => calls.push('fill'),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, raw: ctx, drawAlphas };
}

describe('motivos por pieza', () => {
  it('cada pieza tiene un motivo con al menos una forma', () => {
    for (const kind of ALL_KINDS) {
      const motif = PIECE_MOTIFS[kind];
      expect(motif, kind).toBeDefined();
      expect(motif.polys.length + motif.dots.length, kind).toBeGreaterThan(0);
      expect(MOTIF_LABEL[kind].length, kind).toBeGreaterThan(0);
    }
  });

  it('las coordenadas quedan dentro de la celda', () => {
    for (const kind of ALL_KINDS) {
      const motif = PIECE_MOTIFS[kind];
      for (const poly of motif.polys) {
        for (const [x, y] of poly) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(1);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(1);
        }
      }
      for (const dot of motif.dots) {
        expect(dot.r).toBeGreaterThan(0);
        expect(dot.r).toBeLessThan(0.2);
      }
    }
  });

  it('las 7 firmas son distintas: el motivo no depende solo del color', () => {
    const signatures = new Set(ALL_KINDS.map(motifSignature));
    expect(signatures.size).toBe(ALL_KINDS.length);
  });

  it('dibuja trazos para I y lunares para O, restaurando el contexto', () => {
    const i = fakeCtx();
    drawPieceMotif(i.ctx, 'I', { x: 0, y: 0, w: 100, h: 100 }, { color: '#000', lineWidth: 4, alpha: 0.5 });
    expect(i.calls.filter((c) => c === 'stroke')).toHaveLength(3);
    expect(i.calls.filter((c) => c === 'arc')).toHaveLength(0);
    expect(i.calls[0]).toBe('save');
    expect(i.calls[i.calls.length - 1]).toBe('restore');
    expect(i.raw.globalAlpha).toBe(1); // el alpha se aplicó sobre la copia guardada

    const o = fakeCtx();
    drawPieceMotif(o.ctx, 'O', { x: 10, y: 20, w: 40, h: 40 }, { color: '#000', lineWidth: 2, alpha: 0.6 });
    expect(o.calls.filter((c) => c === 'arc')).toHaveLength(4);
    expect(o.calls.filter((c) => c === 'fill')).toHaveLength(4);
  });

  it('normaliza el alpha fuera de rango', () => {
    const high = fakeCtx();
    drawPieceMotif(high.ctx, 'T', { x: 0, y: 0, w: 10, h: 10 }, { color: '#000', lineWidth: 1, alpha: 4 });
    expect(high.drawAlphas[0]).toBe(1);
    const low = fakeCtx();
    drawPieceMotif(low.ctx, 'T', { x: 0, y: 0, w: 10, h: 10 }, { color: '#000', lineWidth: 1, alpha: -2 });
    expect(low.drawAlphas[0]).toBe(0);
    // El contexto se restaura al salir, incluso con alpha inválido.
    expect(low.raw.globalAlpha).toBe(1);
  });
});
