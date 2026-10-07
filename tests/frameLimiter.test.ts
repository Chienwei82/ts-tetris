import { describe, expect, it } from 'vitest';
import { MAX_FPS } from '../src/render/constants.js';
import { FrameLimiter } from '../src/platform/frameLimiter.js';

/** Frames que `limiter` procesaría sobre `ms` en una pantalla de `hz` Hz. */
function countFrames(limiter: FrameLimiter, hz: number, ms: number): number {
  const step = 1000 / hz;
  let n = 0;
  for (let t = step; t <= ms + 1e-9; t += step) {
    if (limiter.shouldProcess(t)) n++;
  }
  return n;
}

describe('FrameLimiter', () => {
  it('passes every frame on a 60 Hz display', () => {
    expect(countFrames(new FrameLimiter(MAX_FPS), 60, 1000)).toBe(60);
  });

  it('halves a 120 Hz stream down to 60 fps', () => {
    expect(countFrames(new FrameLimiter(MAX_FPS), 120, 1000)).toBe(60);
  });

  it('caps a 144 Hz stream at or below the limit', () => {
    const n = countFrames(new FrameLimiter(MAX_FPS), 144, 1000);
    expect(n).toBeLessThanOrEqual(MAX_FPS);
    expect(n).toBeGreaterThan(40); // still smooth (≈48 fps on a 144 Hz grid)
  });

  it('tolerates vsync jitter at 60 Hz without dropping to 30 fps', () => {
    const limiter = new FrameLimiter(MAX_FPS);
    let n = 0;
    let t = 0;
    for (let i = 0; i < 120; i++) {
      t += i % 2 === 0 ? 16.2 : 17.1; // jitter around the 16.67 ms tick
      if (limiter.shouldProcess(t)) n++;
    }
    expect(n).toBe(120); // all frames processed: no half-rate fallback
  });

  it('recovers immediately after a stall', () => {
    const limiter = new FrameLimiter(MAX_FPS);
    expect(limiter.shouldProcess(0)).toBe(true);
    expect(limiter.shouldProcess(8)).toBe(false);
    expect(limiter.shouldProcess(5000)).toBe(true); // hidden tab / long GC pause
    expect(limiter.shouldProcess(5008)).toBe(false);
    expect(limiter.shouldProcess(5017)).toBe(true);
  });

  it('keeps the configured rate for custom limits', () => {
    expect(countFrames(new FrameLimiter(30), 120, 1000)).toBe(30);
  });
});
