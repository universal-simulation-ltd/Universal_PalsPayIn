import type { EffectiveLedger, EventId, ExpenseEvent, PaymentEvent } from './events';
import { computeShares } from './split';
import { assertMinor } from './money';

/**
 * net = credits − debits, per member, PER CURRENCY. A balance is a vector —
 * Alex can owe Sam €40 and £15, and that is the truth, not a presentation
 * problem. Netting across currencies would require asserting an exchange
 * rate, which is asserting a fact about money we do not have. Refused.
 *
 * Sums are over a set, so arrival order and clock skew cannot change them.
 */
export type CurrencyNets = Map<string, Map<EventId, number>>; // currency -> member -> net minor

export interface BalancesResult {
  nets: CurrencyNets;
  /** Currencies where the nets do not sum to zero — means a corrupt ledger; the UI says so rather than rendering a plausible wrong number. */
  corruptCurrencies: string[];
}

export function balances(ledger: EffectiveLedger): BalancesResult {
  const nets: CurrencyNets = new Map();
  const bump = (currency: string, member: EventId, delta: number) => {
    assertMinor(delta, 'balances');
    let m = nets.get(currency);
    if (!m) nets.set(currency, (m = new Map()));
    m.set(member, (m.get(member) ?? 0) + delta);
  };

  for (const o of ledger.opening) bump(o.currency, o.member, o.minor);

  for (const e of ledger.entries) {
    if (e.kind === 'expense') {
      bump(e.currency, e.payer, e.minor); // payer is credited the full amount
      for (const [member, share] of computeShares(e)) bump(e.currency, member, -share);
    } else {
      // "x says they sent y M": x is credited, y is debited.
      bump(e.currency, e.from, e.minor);
      bump(e.currency, e.to, -e.minor);
    }
  }

  const corruptCurrencies: string[] = [];
  for (const [currency, m] of nets) {
    let sum = 0;
    for (const v of m.values()) sum += v;
    // Exactly zero by construction, because allocate is exact. If it is ever
    // non-zero the ledger is corrupt and the app must say so.
    if (sum !== 0) corruptCurrencies.push(currency);
    for (const [member, v] of m) if (v === 0) m.delete(member);
  }
  return { nets, corruptCurrencies };
}

/**
 * The raw pairwise view: who owes whom DIRECTLY, from the expenses and
 * payments as recorded, with no simplification. Positive value at [a][b]
 * means a owes b. Always one tap away in the UI.
 */
export type PairwiseDebts = Map<string, Map<string, number>>; // "a|b|currency" flattened below instead

export interface PairwiseDebt {
  from: EventId; // owes
  to: EventId; // is owed
  currency: string;
  minor: number; // > 0
}

export function pairwiseDebts(ledger: EffectiveLedger): PairwiseDebt[] {
  // key: from|to|currency with from < to canonicalised; value signed from a->b
  const net = new Map<string, number>();
  const bump = (a: EventId, b: EventId, currency: string, minor: number) => {
    // a owes b `minor` more
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const sign = a < b ? 1 : -1;
    const key = `${lo}|${hi}|${currency}`;
    net.set(key, (net.get(key) ?? 0) + sign * minor);
  };

  for (const e of ledger.entries) {
    if (e.kind === 'expense') {
      for (const [member, share] of computeShares(e as ExpenseEvent)) {
        if (member !== e.payer && share !== 0) bump(member, e.payer, e.currency, share);
      }
    } else {
      const p = e as PaymentEvent;
      bump(p.from, p.to, p.currency, -p.minor); // paying reduces what you owe them
    }
  }

  const out: PairwiseDebt[] = [];
  for (const [key, v] of net) {
    if (v === 0) continue;
    const [lo, hi, currency] = key.split('|');
    out.push(v > 0 ? { from: lo, to: hi, currency, minor: v } : { from: hi, to: lo, currency, minor: -v });
  }
  out.sort((a, b) => (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0) || b.minor - a.minor);
  return out;
}
