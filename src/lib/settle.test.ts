import { describe, expect, it } from 'vitest';
import { chooseSettlePlan, constrainedPlan, maxZeroSumPartition, settlePlan, EXACT_LIMIT, type Transfer } from './settle';
import type { BalancesResult, PairwiseDebt } from './balances';

function bal(nets: Record<string, number>, currency = 'GBP'): BalancesResult {
  return { nets: new Map([[currency, new Map(Object.entries(nets))]]), corruptCurrencies: [] };
}

function applyTransfers(nets: Record<string, number>, transfers: Transfer[]): Record<string, number> {
  const out = { ...nets };
  for (const t of transfers) {
    out[t.from] += t.minor; // paying raises your net (you owed less than before)
    out[t.to] -= t.minor;
  }
  return out;
}

describe('settle-up', () => {
  it("Verhoeff's six-balance counterexample: exact search finds 4 where greedy gives 5", () => {
    // −120, +110, −60, +90, −50, +30 — largest-meets-largest destroys the
    // hidden partition {−120,+90,+30} ∪ {−60,−50,+110}.
    const nets = { a: -120, b: 110, c: -60, d: 90, e: -50, f: 30 };
    const plan = settlePlan(bal(nets));
    expect(plan.exact).toBe(true);
    expect(plan.transfers.length).toBe(4);
    // And the plan actually settles everyone to zero.
    const after = applyTransfers(nets, plan.transfers);
    expect(Object.values(after).every((v) => v === 0)).toBe(true);
  });

  it('never exceeds n − 1 transfers, and settles exactly, over random ledgers', () => {
    let s = 12345;
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 2 ** 32);
    for (let trial = 0; trial < 500; trial++) {
      const n = 2 + Math.floor(rand() * 10);
      const nets: Record<string, number> = {};
      let sum = 0;
      for (let i = 0; i < n - 1; i++) {
        const v = Math.floor(rand() * 2000) - 1000;
        nets[`m${i}`] = v;
        sum += v;
      }
      nets[`m${n - 1}`] = -sum;
      const nonZero = Object.values(nets).filter((v) => v !== 0).length;
      const plan = settlePlan(bal(nets));
      expect(plan.transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
      const after = applyTransfers(nets, plan.transfers);
      expect(Object.values(after).every((v) => v === 0)).toBe(true);
      expect(plan.transfers.every((t) => t.minor > 0)).toBe(true);
    }
  });

  it('cancels exact opposite pairs into single direct transfers', () => {
    const plan = settlePlan(bal({ a: -500, b: 500, c: -300, d: 300 }));
    expect(plan.transfers.length).toBe(2);
    expect(plan.exact).toBe(true);
  });

  it('is deterministic — the same ledger never produces a different plan on refresh', () => {
    const nets = { a: -120, b: 110, c: -60, d: 90, e: -50, f: 30 };
    const p1 = settlePlan(bal(nets));
    const p2 = settlePlan(bal(nets));
    expect(p1).toEqual(p2);
  });

  it('settles currencies independently — never nets €40 against £15', () => {
    const nets: BalancesResult = {
      nets: new Map([
        ['GBP', new Map([['a', -1500], ['b', 1500]])],
        ['EUR', new Map([['a', 4000], ['b', -4000]])],
      ]),
      corruptCurrencies: [],
    };
    const plan = settlePlan(nets);
    expect(plan.transfers).toHaveLength(2);
    const currencies = plan.transfers.map((t) => t.currency).sort();
    expect(currencies).toEqual(['EUR', 'GBP']);
    // Opposite directions — a owes in GBP, is owed in EUR. Both survive.
    const gbp = plan.transfers.find((t) => t.currency === 'GBP')!;
    const eur = plan.transfers.find((t) => t.currency === 'EUR')!;
    expect(gbp.from).toBe('a');
    expect(eur.from).toBe('b');
  });

  it('falls back to greedy above EXACT_LIMIT and says so via exact=false', () => {
    const nets: Record<string, number> = {};
    // Odd amounts so no zeros and no opposite pairs cancel below the limit.
    for (let i = 0; i < EXACT_LIMIT + 4; i++) nets[`m${i}`] = 1001 + 13 * i;
    const total = Object.values(nets).reduce((a, b) => a + b, 0);
    nets['sink'] = -total;
    const plan = settlePlan(bal(nets));
    expect(plan.exact).toBe(false);
    const after = applyTransfers(nets, plan.transfers);
    expect(Object.values(after).every((v) => v === 0)).toBe(true);
  });

  it('maxZeroSumPartition finds the documented partitions', () => {
    expect(maxZeroSumPartition([-120, 110, -60, 90, -50, 30]).length).toBe(2);
    expect(maxZeroSumPartition([100, -100, 50, -50]).length).toBe(2);
    expect(maxZeroSumPartition([3, -1, -1, -1]).length).toBe(1); // forces n−1 transfers
  });

  it('prefers the constrained plan when it is within one transfer (a plan people believe)', () => {
    // a owes b 10, b owes c 10. Unconstrained optimum: a→c 10, b nets out (1 transfer).
    // Constrained (only existing debts): a→b, b→c (2 transfers) — within one, so preferred.
    const pairwise: PairwiseDebt[] = [
      { from: 'a', to: 'b', currency: 'GBP', minor: 1000 },
      { from: 'b', to: 'c', currency: 'GBP', minor: 1000 },
    ];
    const choice = chooseSettlePlan(bal({ a: -1000, b: 0, c: 1000 }), pairwise);
    expect(choice.usedConstrained).toBe(true);
    expect(choice.plan).toHaveLength(2);
    expect(choice.unconstrainedCount).toBe(1);
    // No transfer in the constrained plan is between people who never shared a debt.
    expect(choice.plan.every((t) => pairwise.some((p) => p.from === t.from && p.to === t.to))).toBe(true);
  });

  it('abandons the constrained plan when it costs more than one extra transfer', () => {
    // A chain a→b→c→d→e of equal debts nets to one transfer a→e; the chain
    // itself is 4. Difference 3 > 1, so the optimum wins.
    const pairwise: PairwiseDebt[] = [
      { from: 'a', to: 'b', currency: 'GBP', minor: 1000 },
      { from: 'b', to: 'c', currency: 'GBP', minor: 1000 },
      { from: 'c', to: 'd', currency: 'GBP', minor: 1000 },
      { from: 'd', to: 'e', currency: 'GBP', minor: 1000 },
    ];
    const choice = chooseSettlePlan(bal({ a: -1000, b: 0, c: 0, d: 0, e: 1000 }), pairwise);
    expect(choice.usedConstrained).toBe(false);
    expect(choice.plan).toHaveLength(1);
  });

  it('constrainedPlan is exactly the netted pairwise debts', () => {
    const pairwise: PairwiseDebt[] = [{ from: 'x', to: 'y', currency: 'EUR', minor: 250 }];
    expect(constrainedPlan(pairwise)).toEqual([{ from: 'x', to: 'y', currency: 'EUR', minor: 250 }]);
  });
});
