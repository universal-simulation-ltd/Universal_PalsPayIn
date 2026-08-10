import { allocate } from './allocate';
import type { EventId, ExpenseEvent, SplitSpec } from './events';

/**
 * What each participant owes for one expense, in minor units, summing to
 * EXACTLY the expense total. Every split mode reduces to `allocate`.
 *
 * Throws on a spec that does not add up — the app refuses to save a split
 * that doesn't sum, rather than silently normalising (silent normalisation is
 * how a 33/33/33 split quietly loses a penny).
 */
export function computeShares(expense: ExpenseEvent): Map<EventId, number> {
  return sharesFor(expense.split, expense.minor, expense.id);
}

export function sharesFor(split: SplitSpec, totalMinor: number, seed: string): Map<EventId, number> {
  const out = new Map<EventId, number>();
  const add = (member: EventId, minor: number) => out.set(member, (out.get(member) ?? 0) + minor);

  switch (split.mode) {
    case 'even': {
      if (split.participants.length === 0) throw new Error('No participants');
      const shares = allocate(totalMinor, split.participants.map(() => 1), seed);
      split.participants.forEach((m, i) => add(m, shares[i]));
      break;
    }
    case 'exact': {
      const sum = split.amounts.reduce((a, e) => a + e.minor, 0);
      if (sum !== totalMinor) throw new Error(`Exact amounts sum to ${sum}, expense is ${totalMinor}`);
      for (const e of split.amounts) add(e.member, e.minor);
      break;
    }
    case 'shares': {
      // Integer weights. Percentages are weights in basis points; the UI
      // refuses to save percentages that do not sum to exactly 10,000.
      const members = split.shares.map((s) => s.member);
      const weights = split.shares.map((s) => s.weight);
      const shares = allocate(totalMinor, weights, seed);
      members.forEach((m, i) => add(m, shares[i]));
      break;
    }
    case 'itemised': {
      // An item with no assignees is an error, not an even split — defaulting
      // an unassigned item to "everyone" is how one person silently pays for
      // someone else's steak.
      for (const item of split.items) {
        if (item.assignees.length === 0) throw new Error(`Item "${item.label}" has no one assigned`);
        const shares = allocate(item.minor, item.assignees.map(() => 1), seed + item.label);
        item.assignees.forEach((m, i) => add(m, shares[i]));
      }
      // The check line: items + adjustments must equal the expense total. If
      // they disagree, show the difference and refuse to guess.
      const itemSum = split.items.reduce((a, i) => a + i.minor, 0);
      const adjSum = split.adjustments.reduce((a, j) => a + j.minor, 0);
      if (itemSum + adjSum !== totalMinor) {
        throw new Error(`Items (${itemSum}) + adjustments (${adjSum}) ≠ bill total (${totalMinor})`);
      }
      // Adjustments prorate by pre-adjustment subtotal by default; a discount
      // is the same computation with a negative total.
      const subtotalMembers = [...out.keys()];
      for (const adj of split.adjustments) {
        if (adj.alloc === 'prorata') {
          const weights = subtotalMembers.map((m) => out.get(m) ?? 0);
          if (weights.every((w) => w === 0)) throw new Error('Cannot prorate over a zero subtotal');
          const shares = allocate(adj.minor, weights, seed + adj.kind);
          subtotalMembers.forEach((m, i) => add(m, shares[i]));
        } else if (adj.alloc === 'even') {
          const shares = allocate(adj.minor, subtotalMembers.map(() => 1), seed + adj.kind);
          subtotalMembers.forEach((m, i) => add(m, shares[i]));
        } else {
          add(adj.alloc.member, adj.minor);
        }
      }
      break;
    }
  }

  const total = [...out.values()].reduce((a, b) => a + b, 0);
  if (total !== totalMinor) throw new Error(`Shares sum to ${total}, expense is ${totalMinor} — ledger bug`);
  return out;
}

/** Validation that returns a message instead of throwing — for form UX. */
export function splitProblem(split: SplitSpec, totalMinor: number): string | null {
  try {
    sharesFor(split, totalMinor, 'probe');
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
