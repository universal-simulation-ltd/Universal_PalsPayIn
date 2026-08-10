import { assertMinor } from './money';

/**
 * Divide `total` minor units across `weights`, summing to EXACTLY `total`.
 * Largest-remainder method: each participant gets floor(total*w/W); the
 * remaining minor units (fewer than weights.length of them) go one at a time
 * to the largest fractional parts. Ties break on a rotation seeded by `seed`
 * (the expense id), so the same person does not eat the extra penny every time.
 *
 * Invariants (property-tested in allocate.test.ts):
 *  - sum(result) === total, always
 *  - no share is negative when total >= 0
 *  - equal weights differ by at most one minor unit
 *  - zero-weight participants receive exactly 0
 */
export function allocate(total: number, weights: number[], seed = ''): number[] {
  assertMinor(total, 'allocate total');
  if (weights.length === 0) throw new Error('allocate: no participants');
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0) throw new Error(`allocate: bad weight ${w}`);
  }
  if (total < 0) return allocate(-total, weights, seed).map((v) => -v);

  const W = weights.reduce((a, b) => a + b, 0);
  if (W === 0) throw new Error('allocate: all weights zero');

  const shares = weights.map((w) => {
    const prod = total * w;
    if (!Number.isSafeInteger(prod)) throw new Error('allocate: overflow — scale the weights down');
    return Math.floor(prod / W);
  });
  let remainder = total - shares.reduce((a, b) => a + b, 0);

  // Fractional part of each share is (total*w) mod W; larger gets a unit first.
  // Rotation offset from the seed decides ties deterministically but fairly
  // across expenses.
  const offset = seedOffset(seed, weights.length);
  const order = weights
    .map((w, i) => ({ i, frac: (total * w) % W, rot: (i - offset + weights.length) % weights.length }))
    .filter((e) => weights[e.i] > 0)
    .sort((a, b) => b.frac - a.frac || a.rot - b.rot);

  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) {
    shares[order[k].i] += 1;
  }
  return shares;
}

function seedOffset(seed: string, n: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return n === 0 ? 0 : h % n;
}
