import { describe, expect, it } from 'vitest';
import { isRankedMode, RANKED_MODE } from '../src/leaderboard/types.js';

describe('modo del Top de Puntajes', () => {
  it('solo Tradicional entra en el ranking visible', () => {
    expect(RANKED_MODE).toBe('classic');
    expect(isRankedMode('classic')).toBe(true);
    expect(isRankedMode('chaos')).toBe(false);
  });
});
