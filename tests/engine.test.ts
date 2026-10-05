import { describe, expect, it } from 'vitest';
import { collides, createGrid } from '../src/game/board.js';
import { TetrisEngine } from '../src/game/engine.js';
import { cellsForPiece } from '../src/game/pieces.js';
import { LINES_PER_LEVEL, MAX_LEVEL, SECONDS_PER_LEVEL } from '../src/game/types.js';
function seqRng(): () => number { let i = 0; return () => { i = (i + 1) % 100; return i / 100; }; }
describe('pieces', () => {
  it('I piece has 4 cells in a row at spawn', () => {
    expect(cellsForPiece('I', 0, 0, 0)).toHaveLength(4);
  });
  it('O piece does not change shape when rotated', () => {
    const a = cellsForPiece('O', 0, 5, 5);
    const e = new TetrisEngine({ rng: seqRng() });
    e.start();
    e.active = { kind: 'O', rotation: 0, x: 5, y: 10 };
    e.rotate(1);
    const b = e.activeCells();
    expect(a).toHaveLength(4);
    expect(b).toHaveLength(4);
  });
});
describe('collisions', () => {
  it('detects wall collision', () => {
    const g = createGrid();
    expect(collides(g, [{ x: -1, y: 0 }])).toBe(true);
    expect(collides(g, [{ x: 10, y: 0 }])).toBe(true);
    expect(collides(g, [{ x: 0, y: -1 }])).toBe(true);
    expect(collides(g, [{ x: 0, y: 0 }])).toBe(false);
  });
});
describe('engine', () => {
  it('starts with an active piece and a queue', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start();
    expect(e.phase).toBe('playing');
    expect(e.active).not.toBeNull();
    expect(e.peekNext(3)).toHaveLength(3);
  });
  it('clears a full line and scores', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start();
    for (let c = 0; c < 10; c++) e.grid[0]![c] = 'I';
    e.active = { kind: 'O', rotation: 0, x: 4, y: 4 };
    e.hardDrop();
    expect(e.lines).toBeGreaterThanOrEqual(1);
    expect(e.score).toBeGreaterThan(0);
  });
  it('hold swaps once per lock', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start();
    const first = e.active!.kind;
    e.hold();
    expect(e.holdKind).toBe(first);
    expect(e.canHold).toBe(false);
    e.hold();
    expect(e.holdKind).toBe(first);
  });
  it('levels up every 10 lines', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start();
    e.lines = 9;
    for (let c = 0; c < 10; c++) e.grid[0]![c] = 'I';
    e.active = { kind: 'O', rotation: 0, x: 4, y: 4 };
    e.hardDrop();
    expect(e.level).toBe(2);
  });
  it('starts at a chosen level and clamps the value', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start(7);
    expect(e.level).toBe(7);
    expect(e.lines).toBe(0);
    expect(e.levelTime).toBe(0);
    e.start(0);
    expect(e.level).toBe(1);
    e.start(999);
    expect(e.level).toBe(MAX_LEVEL);
  });
  it('levels up over time even without clearing lines', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start();
    e.update(SECONDS_PER_LEVEL);
    expect(e.level).toBe(2);
    expect(e.levelTime).toBeLessThan(SECONDS_PER_LEVEL);
  });
  it('never levels past the cap', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start(MAX_LEVEL);
    e.update(SECONDS_PER_LEVEL * 3);
    expect(e.level).toBe(MAX_LEVEL);
    expect(e.levelProgress().atMax).toBe(true);
  });
  it('reports gauge progress with the leading rule', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start();
    e.lines = 4;
    const byLines = e.levelProgress();
    expect(byLines.source).toBe('lines');
    expect(byLines.ratio).toBeCloseTo(4 / LINES_PER_LEVEL);
    e.lines = 0;
    e.update(SECONDS_PER_LEVEL * 0.5);
    const byTime = e.levelProgress();
    expect(byTime.source).toBe('time');
    expect(byTime.ratio).toBeCloseTo(0.5);
  });
  it('clamps lines progress to the current level window', () => {
    const e = new TetrisEngine({ rng: seqRng() });
    e.start(5);
    e.lines = 3; // below the level-5 window (40 lines)
    const p = e.levelProgress();
    expect(p.ratio).toBe(0);
    expect(p.source).toBe('lines');
  });
});
