import { describe, expect, it } from 'vitest';
import { LEADERBOARD_MODES } from '../src/leaderboard/types.js';

describe('tableros del Top de Puntajes', () => {
  it('mantiene Tradicional y Caos como tableros independientes', () => {
    expect(LEADERBOARD_MODES).toEqual(['classic', 'chaos']);
  });
});
