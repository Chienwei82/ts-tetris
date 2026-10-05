import { describe, expect, it } from 'vitest';
import { THEMES, themeIndexForLevel } from '../src/render/themes.js';

describe('stage themes', () => {
  it('maps levels to a theme every two levels', () => {
    expect(THEMES).toHaveLength(10);
    expect(themeIndexForLevel(1)).toBe(0);
    expect(themeIndexForLevel(2)).toBe(0);
    expect(themeIndexForLevel(3)).toBe(1);
    expect(themeIndexForLevel(20)).toBe(9);
  });
  it('clamps out-of-range levels', () => {
    expect(themeIndexForLevel(0)).toBe(0);
    expect(themeIndexForLevel(-5)).toBe(0);
    expect(themeIndexForLevel(999)).toBe(THEMES.length - 1);
  });
  it('defines a complete theme for each entry', () => {
    for (const t of THEMES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.sky).toHaveLength(4);
      expect(t.hills).toHaveLength(3);
      expect(t.confetti).toBeGreaterThan(0);
    }
  });
});
