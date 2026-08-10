import { describe, expect, it } from 'vitest';
import { allocate } from './allocate';
import { parseAmount, formatAmount, currencyExponent } from './money';

// Deterministic PRNG so a failure reproduces.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('allocate — the invariant the whole product rests on', () => {
  it('sums to exactly the total, for thousands of random cases', () => {
    const rand = rng(42);
    for (let trial = 0; trial < 5000; trial++) {
      const n = 1 + Math.floor(rand() * 12);
      const total = Math.floor(rand() * 1_000_000);
      const weights: number[] = Array.from({ length: n }, () => Math.floor(rand() * 100));
      if (!weights.some((w) => w > 0)) weights[0] = 1;
      const shares = allocate(total, weights, `seed${trial}`);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
      expect(shares.every((s) => s >= 0)).toBe(true);
      expect(shares.every((s) => Number.isSafeInteger(s))).toBe(true);
    }
  });

  it('equal weights differ by at most one minor unit', () => {
    const rand = rng(7);
    for (let trial = 0; trial < 2000; trial++) {
      const n = 2 + Math.floor(rand() * 10);
      const total = Math.floor(rand() * 100_000);
      const shares = allocate(total, Array(n).fill(1), `t${trial}`);
      expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
    }
  });

  it('£10 three ways is 334/333/333 and the 334 rotates with the seed', () => {
    const winners = new Set<number>();
    for (let i = 0; i < 30; i++) {
      const shares = allocate(1000, [1, 1, 1], `expense-${i}`);
      expect([...shares].sort((a, b) => b - a)).toEqual([334, 333, 333]);
      winners.add(shares.indexOf(334));
    }
    // The same person must not eat the extra penny every single time.
    expect(winners.size).toBeGreaterThan(1);
  });

  it('is deterministic for the same seed', () => {
    expect(allocate(1001, [3, 2, 2], 'abc')).toEqual(allocate(1001, [3, 2, 2], 'abc'));
  });

  it('zero-weight participants get exactly zero, including remainder pennies', () => {
    const rand = rng(99);
    for (let trial = 0; trial < 1000; trial++) {
      const weights = [0, 1 + Math.floor(rand() * 5), 1 + Math.floor(rand() * 5), 0];
      const shares = allocate(Math.floor(rand() * 10_000), weights, `z${trial}`);
      expect(shares[0]).toBe(0);
      expect(shares[3]).toBe(0);
    }
  });

  it('negative totals (discounts) allocate symmetrically and sum exactly', () => {
    const shares = allocate(-1000, [1, 1, 1], 'd');
    expect(shares.reduce((a, b) => a + b, 0)).toBe(-1000);
    expect(shares.every((s) => s <= 0)).toBe(true);
  });

  it('refuses floats and all-zero weights', () => {
    expect(() => allocate(10.5, [1], 's')).toThrow();
    expect(() => allocate(10, [0, 0], 's')).toThrow();
    expect(() => allocate(10, [], 's')).toThrow();
  });
});

describe('money — integer minor units, exponent from ISO 4217', () => {
  it('parses per-currency exponents (not a hard-coded ×100)', () => {
    expect(parseAmount('42.60', 'GBP')).toBe(4260);
    expect(parseAmount('1200', 'JPY')).toBe(1200); // exponent 0
    expect(parseAmount('12.00', 'JPY')).toBe(null); // yen has no minor unit
    expect(parseAmount('1.234', 'BHD')).toBe(1234); // exponent 3
    expect(parseAmount('1.2345', 'GBP')).toBe(null); // more precision than pence
    expect(parseAmount('abc', 'GBP')).toBe(null);
    expect(currencyExponent('KWD')).toBe(3);
  });

  it('formats back exactly', () => {
    expect(formatAmount(4260, 'GBP')).toBe('£42.60');
    expect(formatAmount(-4260, 'GBP')).toBe('-£42.60');
    expect(formatAmount(1200, 'JPY')).toBe('¥1200');
    expect(formatAmount(1234, 'BHD')).toBe('1.234 BHD');
  });
});
