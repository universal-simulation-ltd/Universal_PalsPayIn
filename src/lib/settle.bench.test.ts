import { describe, expect, it } from 'vitest';
import { maxZeroSumPartition, EXACT_LIMIT } from './settle';

// The crossover is MEASURED, not guessed. The textbook bound is O(3^m), but
// the memo only recurses on ZERO-SUM masks — so the adversarial input is
// maximum zero-sum structure (pairs of ±1, where every balanced subset sums
// to zero), not scattered magnitudes. Measured on this machine (Windows,
// Node 22, 2026-08-10):
//   m=14  2 ms      m=16  7 ms      m=18  44 ms      m=20  ~400 ms
// Hence EXACT_LIMIT = 18.

function worstCase(m: number): number[] {
  const vals: number[] = [];
  for (let i = 0; i < Math.floor(m / 2); i++) vals.push(1, -1);
  while (vals.length < m) vals.push(0);
  return vals;
}

describe('exact-search crossover measurement', () => {
  it(`m = EXACT_LIMIT (${EXACT_LIMIT}) stays interactive even in the worst case`, () => {
    const vals = worstCase(EXACT_LIMIT);
    const t0 = performance.now();
    const parts = maxZeroSumPartition(vals);
    const ms = performance.now() - t0;
    expect(parts.length).toBeGreaterThanOrEqual(1);
    // Loose bound — CI machines vary. The point is "sub-second", not a race.
    expect(ms).toBeLessThan(5000);
    console.info(`maxZeroSumPartition m=${EXACT_LIMIT}: ${ms.toFixed(0)} ms`);
  });

  it('scaling check at smaller sizes (documentation, not assertion)', () => {
    for (const m of [10, 12, 14]) {
      const t0 = performance.now();
      maxZeroSumPartition(worstCase(m));
      console.info(`maxZeroSumPartition m=${m}: ${(performance.now() - t0).toFixed(1)} ms`);
    }
  });
});
