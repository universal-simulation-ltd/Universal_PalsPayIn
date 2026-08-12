// The numbers on the summary rails — the one beside the group list, and the
// one beside an open group.
//
// Every figure here is a fold over the SAME effective ledger the tabs read, so
// a stat and the tab it summarises can never disagree. Nothing is stored; a
// stat is never an event.
//
// Two rules from the ledger carry straight through:
//   - money stays per currency, never netted across them (`totals` is a list,
//     not a number), and
//   - "owed" is what is owed BETWEEN people. This app never holds money, so
//     there is nothing here that could be read as a balance we keep.

import type { BalancesResult } from './balances';
import type { EffectiveLedger } from './events';

export interface CurrencyTotal {
  currency: string;
  /** Sum of the expenses recorded in this currency. */
  spent: number;
  /** What still has to move for everyone to be square: the sum of the positive nets. */
  owed: number;
}

export interface GroupStats {
  members: number;
  expenses: number;
  payments: number;
  /** Per currency, sorted by code. */
  totals: CurrencyTotal[];
  /** Nothing outstanding in any currency. Also true of an empty group — check `expenses` first. */
  square: boolean;
  /**
   * History has been folded into opening balances, so `spent` counts only what
   * is still in the log. The rail says so rather than quietly shrinking.
   */
  folded: boolean;
  /** ISO dates of the earliest and latest entry, or null when there are none. */
  first: string | null;
  last: string | null;
}

export function groupStats(ledger: EffectiveLedger, bal: BalancesResult): GroupStats {
  const spent = new Map<string, number>();
  let expenses = 0;
  let payments = 0;
  let first: string | null = null;
  let last: string | null = null;

  for (const e of ledger.entries) {
    if (e.kind === 'expense') {
      expenses += 1;
      spent.set(e.currency, (spent.get(e.currency) ?? 0) + e.minor);
    } else {
      payments += 1;
    }
    // ISO dates sort lexically, which is the whole reason the ledger stores them that way.
    if (first === null || e.date < first) first = e.date;
    if (last === null || e.date > last) last = e.date;
  }

  // Credits and debits sum to zero per currency, so the positive side alone is
  // the amount outstanding — counting both would double it.
  const owed = new Map<string, number>();
  for (const [currency, nets] of bal.nets) {
    let positive = 0;
    for (const v of nets.values()) if (v > 0) positive += v;
    owed.set(currency, positive);
  }

  return {
    members: ledger.members.length,
    expenses,
    payments,
    totals: mergeTotals(spent, owed),
    square: [...owed.values()].every((v) => v === 0),
    folded: ledger.opening.length > 0,
    first,
    last,
  };
}

export interface PortfolioStats {
  groups: number;
  /** Groups with something still outstanding. */
  open: number;
  expenses: number;
  payments: number;
  totals: CurrencyTotal[];
  folded: boolean;
}

/** The same numbers across every group on this device. Currencies stay apart here too. */
export function portfolioStats(all: GroupStats[]): PortfolioStats {
  const spent = new Map<string, number>();
  const owed = new Map<string, number>();
  let expenses = 0;
  let payments = 0;
  let open = 0;
  let folded = false;

  for (const s of all) {
    expenses += s.expenses;
    payments += s.payments;
    if (!s.square) open += 1;
    if (s.folded) folded = true;
    for (const t of s.totals) {
      spent.set(t.currency, (spent.get(t.currency) ?? 0) + t.spent);
      owed.set(t.currency, (owed.get(t.currency) ?? 0) + t.owed);
    }
  }

  return { groups: all.length, open, expenses, payments, totals: mergeTotals(spent, owed), folded };
}

function mergeTotals(spent: Map<string, number>, owed: Map<string, number>): CurrencyTotal[] {
  return [...new Set([...spent.keys(), ...owed.keys()])]
    .sort()
    .map((currency) => ({ currency, spent: spent.get(currency) ?? 0, owed: owed.get(currency) ?? 0 }))
    // A currency that appears only as a zero — every entry in it amended away —
    // is noise on a rail with four numbers on it.
    .filter((t) => t.spent !== 0 || t.owed !== 0);
}
