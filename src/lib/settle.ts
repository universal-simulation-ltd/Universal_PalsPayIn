import type { EventId } from './events';
import type { BalancesResult, PairwiseDebt } from './balances';

// Settle-up. Minimising the number of transfers is strongly NP-hard
// (Verhoeff 2004, by reduction from 3-Partition; Yao 2017 from Subset-Sum),
// but the structural fact OPT = n − (max disjoint zero-sum parts) makes the
// exact optimum computable at real group sizes:
//
//   1. drop zero balances                      (never prohibits optimality)
//   2. cancel exact opposite pairs             (never prohibits optimality)
//   3. m remaining ≤ EXACT_LIMIT → memoised subset search for the maximum
//      zero-sum partition, transfers built greedily inside each part
//   4. above the limit → plain greedy, and the result is LABELLED differently
//
// Greedy (largest creditor meets largest debtor) guarantees at most n−1
// transfers and minimises TOTAL MONEY MOVED — a different objective — but is
// not optimal for transfer count: −120,+110,−60,+90,−50,+30 gives 5 greedy
// vs 4 optimal. The two labels below are the honest difference.
//
// Simplification is a VIEW. Nothing here ever mutates the ledger.

/**
 * Measured crossover, not guessed (settle.bench.test.ts, Node 22, 2026-08-10).
 * The DP only recurses on zero-sum masks, so the adversarial case is MAXIMUM
 * zero-sum structure (±1 pairs), not scattered magnitudes: that gives
 * m=16 → 7 ms, m=18 → 44 ms, m=20 → ~400 ms. 18 keeps the worst case under
 * a frame budget's worth of blocking, and real groups preprocess (drop zeros,
 * cancel opposites) to well below it.
 */
export const EXACT_LIMIT = 18;

export interface Transfer {
  from: EventId;
  to: EventId;
  currency: string;
  minor: number;
}

export interface SettlePlan {
  transfers: Transfer[];
  /** True when every currency's plan came from the exact search — "the fewest possible". */
  exact: boolean;
}

/** The unconstrained plan: fewest transfers we can prove (or greedy above the limit). */
export function settlePlan(bal: BalancesResult): SettlePlan {
  const transfers: Transfer[] = [];
  let exact = true;
  for (const [currency, nets] of bal.nets) {
    // Deterministic input order: the same ledger must never produce a
    // different plan on refresh. Sort by member id.
    const entries = [...nets.entries()].filter(([, v]) => v !== 0).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const { transfers: t, exact: e } = settleCurrency(entries, currency);
    transfers.push(...t);
    exact = exact && e;
  }
  return { transfers, exact };
}

/**
 * The constrained plan (Splitwise's published invariant): no one is asked to
 * pay a person they didn't already owe. That is exactly the netted pairwise
 * debt list — transfers only along existing debt edges. It can cost transfers;
 * it buys believability. The UI prefers it as the default when it is within
 * one transfer of the unconstrained optimum.
 */
export function constrainedPlan(pairwise: PairwiseDebt[]): Transfer[] {
  return pairwise.map((d) => ({ from: d.from, to: d.to, currency: d.currency, minor: d.minor }));
}

export interface SettleChoice {
  plan: Transfer[];
  exact: boolean;
  /** Which plan was chosen and why — surfaced in the UI, not buried. */
  usedConstrained: boolean;
  /** Transfer count of the unconstrained plan, for honest labelling. */
  unconstrainedCount: number;
  unconstrainedPlan: Transfer[];
}

export function chooseSettlePlan(bal: BalancesResult, pairwise: PairwiseDebt[]): SettleChoice {
  const unconstrained = settlePlan(bal);
  const constrained = constrainedPlan(pairwise);
  const base = { unconstrainedCount: unconstrained.transfers.length, unconstrainedPlan: unconstrained.transfers };
  // A plan people believe beats a plan that is one transfer shorter.
  if (constrained.length <= unconstrained.transfers.length + 1) {
    return { ...base, plan: constrained, exact: unconstrained.exact && constrained.length <= unconstrained.transfers.length, usedConstrained: true };
  }
  return { ...base, plan: unconstrained.transfers, exact: unconstrained.exact, usedConstrained: false };
}

// ---------------------------------------------------------------------------

function settleCurrency(entries: [EventId, number][], currency: string): { transfers: Transfer[]; exact: boolean } {
  if (entries.length === 0) return { transfers: [], exact: true };

  const transfers: Transfer[] = [];

  // Step 2: cancel exact opposite pairs — one transfer each, provably safe.
  const remaining: [EventId, number][] = [];
  const byAmount = new Map<number, EventId[]>();
  for (const [id, v] of entries) {
    const opp = byAmount.get(-v);
    if (opp && opp.length > 0) {
      const other = opp.shift()!;
      const [debtor, creditor] = v < 0 ? [id, other] : [other, id];
      transfers.push({ from: debtor, to: creditor, currency, minor: Math.abs(v) });
    } else {
      const list = byAmount.get(v) ?? [];
      list.push(id);
      byAmount.set(v, list);
    }
  }
  for (const [v, ids] of byAmount) for (const id of ids) remaining.push([id, v]);
  remaining.sort((a, b) => (a[0] < b[0] ? -1 : 1));

  if (remaining.length === 0) return { transfers, exact: true };

  if (remaining.length <= EXACT_LIMIT) {
    const parts = maxZeroSumPartition(remaining.map(([, v]) => v));
    for (const part of parts) {
      const sub = part.map((i) => remaining[i]);
      transfers.push(...greedyTransfers(sub, currency));
    }
    return { transfers, exact: true };
  }

  transfers.push(...greedyTransfers(remaining, currency));
  return { transfers, exact: false };
}

/**
 * Maximum partition of `vals` (which sum to zero) into disjoint zero-sum
 * parts. Returns the parts as index lists. Memoised subset DP: for each
 * zero-sum mask, best = max over zero-sum submasks containing the lowest set
 * bit. O(3^m) worst case; m ≤ EXACT_LIMIT.
 */
export function maxZeroSumPartition(vals: number[]): number[][] {
  const n = vals.length;
  const full = (1 << n) - 1;
  const sum = new Int32Array(1 << n);
  for (let mask = 1; mask <= full; mask++) {
    const low = mask & -mask;
    const i = 31 - Math.clz32(low);
    sum[mask] = sum[mask ^ low] + vals[i];
  }

  const best = new Int16Array(1 << n).fill(-1);
  const choice = new Int32Array(1 << n);
  best[0] = 0;

  const solve = (mask: number): number => {
    if (best[mask] >= 0) return best[mask];
    const low = mask & -mask;
    let b = -1;
    let ch = 0;
    // Enumerate submasks of `mask` that contain `low`.
    for (let sub = mask; sub > 0; sub = (sub - 1) & mask) {
      if (!(sub & low)) continue;
      if (sum[sub] !== 0) continue;
      const rest = solve(mask ^ sub);
      if (rest >= 0 && rest + 1 > b) {
        b = rest + 1;
        ch = sub;
      }
    }
    // sum[mask] === 0 guarantees at least sub = mask works, so b >= 1 here.
    best[mask] = b;
    choice[mask] = ch;
    return b;
  };
  solve(full);

  const parts: number[][] = [];
  for (let mask = full; mask > 0; mask ^= choice[mask]) {
    const part: number[] = [];
    for (let i = 0; i < n; i++) if (choice[mask] & (1 << i)) part.push(i);
    parts.push(part);
  }
  return parts;
}

/**
 * Greedy inside a set: largest creditor meets largest debtor, transfer
 * min(a,|b|). At most size−1 transfers; minimises total money moved. Ties
 * break on member id so the output is deterministic.
 */
function greedyTransfers(entries: [EventId, number][], currency: string): Transfer[] {
  const creditors = entries.filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const debtors = entries.filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const byLargest = (a: { id: string; v: number }, b: { id: string; v: number }) => b.v - a.v || (a.id < b.id ? -1 : 1);
  const out: Transfer[] = [];
  while (creditors.length && debtors.length) {
    creditors.sort(byLargest);
    debtors.sort(byLargest);
    const c = creditors[0];
    const d = debtors[0];
    const m = Math.min(c.v, d.v);
    out.push({ from: d.id, to: c.id, currency, minor: m });
    c.v -= m;
    d.v -= m;
    if (c.v === 0) creditors.shift();
    if (d.v === 0) debtors.shift();
  }
  return out;
}
