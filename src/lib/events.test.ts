import { describe, expect, it } from 'vitest';
import {
  effectiveLedger, findDuplicateSuspicions, mergeEvents, randomEventId,
  type AmendEvent, type CompactEvent, type ExpenseEvent, type LedgerEvent, type MemberEvent, type PaymentEvent, type VoidEvent,
} from './events';
import { balances, pairwiseDebts } from './balances';

let nextId = 0;
const id = () => (nextId++).toString(16).padStart(12, '0');

function member(name: string, at = 1000): MemberEvent {
  return { kind: 'member', id: id(), author: 'dev1', at, name, colour: '#0ea5e9' };
}
function expense(payer: string, minor: number, participants: string[], over: Partial<ExpenseEvent> = {}): ExpenseEvent {
  return {
    kind: 'expense', id: id(), author: 'dev1', at: 2000, payer, minor, currency: 'GBP',
    date: '2026-08-01', description: 'Taxi', split: { mode: 'even', participants }, ...over,
  };
}
function payment(from: string, to: string, minor: number, over: Partial<PaymentEvent> = {}): PaymentEvent {
  return { kind: 'payment', id: id(), author: 'dev1', at: 3000, from, to, minor, currency: 'GBP', date: '2026-08-02', ...over };
}

describe('union merge — the decision that IS the product', () => {
  it('is idempotent: merging the same log twice equals once, and a stale re-import is a no-op', () => {
    const a = member('Sam');
    const b = expense(a.id, 4260, [a.id]);
    const log: LedgerEvent[] = [a, b];
    const once = mergeEvents(log, log);
    expect(once.merged).toHaveLength(2);
    expect(once.added).toHaveLength(0);
    // Yesterday's link must never delete today's expenses.
    const stale = [a];
    const re = mergeEvents(log, stale);
    expect(re.merged).toHaveLength(2);
  });

  it('is commutative: A∪B and B∪A produce the same effective ledger', () => {
    const m1 = member('Sam');
    const m2 = member('Alex');
    const e1 = expense(m1.id, 1000, [m1.id, m2.id]);
    const e2 = expense(m2.id, 500, [m1.id, m2.id]);
    const ab = effectiveLedger(mergeEvents([m1, e1], [m2, e2]).merged);
    const ba = effectiveLedger(mergeEvents([m2, e2], [m1, e1]).merged);
    expect(new Set(ab.entries.map((e) => e.id))).toEqual(new Set(ba.entries.map((e) => e.id)));
    const na = balances(ab).nets.get('GBP');
    const nb = balances(ba).nets.get('GBP');
    expect(na).toEqual(nb);
  });

  it('both adding different expenses offline: union, both present (~95% of real concurrency)', () => {
    const m = member('Sam');
    const mine = expense(m.id, 1000, [m.id]);
    const theirs = expense(m.id, 2000, [m.id]);
    const { merged } = mergeEvents([m, mine], [m, theirs]);
    expect(effectiveLedger(merged).entries).toHaveLength(2);
  });
});

describe('amend / void resolution', () => {
  it('latest (timestamp, author) amend wins; concurrent amends from two authors are flagged, never silent', () => {
    const m = member('Sam');
    const e = expense(m.id, 1000, [m.id]);
    const amendA: AmendEvent = {
      kind: 'amend', id: id(), author: 'devA', at: 5000, supersedes: e.id,
      body: { payer: m.id, minor: 1100, currency: 'GBP', date: e.date, description: 'Taxi (corrected)', split: e.split },
    };
    const amendB: AmendEvent = {
      kind: 'amend', id: id(), author: 'devB', at: 6000, supersedes: e.id,
      body: { payer: m.id, minor: 1200, currency: 'GBP', date: e.date, description: 'Taxi (other correction)', split: e.split },
    };
    const eff = effectiveLedger([m, e, amendA, amendB]);
    const resolved = eff.entries[0] as ExpenseEvent;
    expect(resolved.minor).toBe(1200); // later timestamp wins
    expect(eff.conflicted.has(e.id)).toBe(true); // …but the losing version is offered
    expect(eff.conflicted.get(e.id)).toHaveLength(2);
  });

  it('a re-edit by the same author is not a conflict', () => {
    const m = member('Sam');
    const e = expense(m.id, 1000, [m.id]);
    const a1: AmendEvent = { kind: 'amend', id: id(), author: 'dev1', at: 5000, supersedes: e.id, body: { name: 'x' } as never };
    const eff = effectiveLedger([m, e, a1]);
    expect(eff.conflicted.size).toBe(0);
  });

  it('void wins over amend, and a void is not recoverable by a later amend', () => {
    const m = member('Sam');
    const e = expense(m.id, 1000, [m.id]);
    const v: VoidEvent = { kind: 'void', id: id(), author: 'devA', at: 5000, supersedes: e.id };
    const late: AmendEvent = {
      kind: 'amend', id: id(), author: 'devB', at: 9000, supersedes: e.id,
      body: { payer: m.id, minor: 1100, currency: 'GBP', date: e.date, description: 'resurrect?', split: e.split },
    };
    const eff = effectiveLedger([m, e, v, late]);
    expect(eff.entries).toHaveLength(0);
  });

  it('two voids of the same expense are idempotent', () => {
    const m = member('Sam');
    const e = expense(m.id, 1000, [m.id]);
    const v1: VoidEvent = { kind: 'void', id: id(), author: 'devA', at: 5000, supersedes: e.id };
    const v2: VoidEvent = { kind: 'void', id: id(), author: 'devB', at: 5001, supersedes: e.id };
    expect(effectiveLedger([m, e, v1, v2]).entries).toHaveLength(0);
  });

  it('member renamed on both devices resolves like a double edit', () => {
    const m = member('Sam');
    const rA: AmendEvent = { kind: 'amend', id: id(), author: 'devA', at: 5000, supersedes: m.id, body: { name: 'Sammy', colour: m.colour } };
    const rB: AmendEvent = { kind: 'amend', id: id(), author: 'devB', at: 5000, supersedes: m.id, body: { name: 'Samuel', colour: m.colour } };
    const eff = effectiveLedger([m, rA, rB]);
    // Same timestamp: author id breaks the tie deterministically (devB > devA).
    expect(eff.members[0].name).toBe('Samuel');
    expect(eff.conflicted.has(m.id)).toBe(true);
  });
});

describe('compaction', () => {
  it('a compact removes subsumed events and applies opening balances', () => {
    const m1 = member('Sam');
    const m2 = member('Alex');
    const e = expense(m1.id, 1000, [m1.id, m2.id]);
    const c: CompactEvent = {
      kind: 'compact', id: id(), author: 'dev1', at: 9000, subsumes: [e.id],
      opening: [
        { member: m1.id, currency: 'GBP', minor: 500 },
        { member: m2.id, currency: 'GBP', minor: -500 },
      ],
    };
    const eff = effectiveLedger([m1, m2, e, c]);
    expect(eff.entries).toHaveLength(0);
    const nets = balances(eff).nets.get('GBP')!;
    expect(nets.get(m1.id)).toBe(500);
    expect(nets.get(m2.id)).toBe(-500);
  });

  it('a device re-importing the OLD log after a compact does not double-count', () => {
    const m1 = member('Sam');
    const m2 = member('Alex');
    const e = expense(m1.id, 1000, [m1.id, m2.id]);
    const c: CompactEvent = {
      kind: 'compact', id: id(), author: 'dev1', at: 9000, subsumes: [e.id],
      opening: [
        { member: m1.id, currency: 'GBP', minor: 500 },
        { member: m2.id, currency: 'GBP', minor: -500 },
      ],
    };
    const merged = mergeEvents([m1, m2, e, c], [m1, m2, e]).merged; // stale copy re-unioned
    const nets = balances(effectiveLedger(merged)).nets.get('GBP')!;
    expect(nets.get(m1.id)).toBe(500);
  });

  it('two devices compacting independently: only one compact applies, deterministically', () => {
    const m1 = member('Sam');
    const m2 = member('Alex');
    const e = expense(m1.id, 1000, [m1.id, m2.id]);
    const mk = (author: string, at: number): CompactEvent => ({
      kind: 'compact', id: id(), author, at, subsumes: [e.id],
      opening: [
        { member: m1.id, currency: 'GBP', minor: 500 },
        { member: m2.id, currency: 'GBP', minor: -500 },
      ],
    });
    const cA = mk('devA', 9000);
    const cB = mk('devB', 9100);
    const merged1 = effectiveLedger([m1, m2, e, cA, cB]);
    const merged2 = effectiveLedger([m1, m2, e, cB, cA]); // arrival order must not matter
    for (const eff of [merged1, merged2]) {
      const nets = balances(eff).nets.get('GBP')!;
      expect(nets.get(m1.id)).toBe(500); // applied once, not twice
      expect(eff.skippedCompacts).toHaveLength(1);
    }
  });
});

describe('duplicate suspicion — surfaced, never auto-applied', () => {
  it('flags same payer + same amount within 2 days across a merge', () => {
    const m = member('Sam');
    const mine = expense(m.id, 4000, [m.id], { date: '2026-08-01' });
    const theirs = expense(m.id, 4000, [m.id], { date: '2026-08-02' });
    const sus = findDuplicateSuspicions([m, mine], [theirs]);
    expect(sus).toHaveLength(1);
  });

  it('does not flag different amounts, different payers, or far-apart dates', () => {
    const m1 = member('Sam');
    const m2 = member('Alex');
    const mine = expense(m1.id, 4000, [m1.id], { date: '2026-08-01' });
    expect(findDuplicateSuspicions([m1, m2, mine], [expense(m1.id, 4100, [m1.id], { date: '2026-08-01' })])).toHaveLength(0);
    expect(findDuplicateSuspicions([m1, m2, mine], [expense(m2.id, 4000, [m2.id], { date: '2026-08-01' })])).toHaveLength(0);
    expect(findDuplicateSuspicions([m1, m2, mine], [expense(m1.id, 4000, [m1.id], { date: '2026-08-09' })])).toHaveLength(0);
  });
});

describe('balances and the pairwise view', () => {
  it('nets sum to exactly zero per currency, and clock skew cannot move them', () => {
    const m1 = member('Sam');
    const m2 = member('Alex');
    const m3 = member('Jo');
    const e1 = expense(m1.id, 4260, [m1.id, m2.id, m3.id]);
    const e2 = expense(m2.id, 999, [m1.id, m2.id], { at: 99999999 }); // wildly different clock
    const eff = effectiveLedger([m1, m2, m3, e1, e2]);
    const res = balances(eff);
    expect(res.corruptCurrencies).toHaveLength(0);
    let sum = 0;
    for (const v of res.nets.get('GBP')!.values()) sum += v;
    expect(sum).toBe(0);
  });

  it('a payment is a claim that moves both nets by the full amount', () => {
    const m1 = member('Sam');
    const m2 = member('Alex');
    const e = expense(m1.id, 1000, [m1.id, m2.id]);
    const p = payment(m2.id, m1.id, 500);
    const nets = balances(effectiveLedger([m1, m2, e, p])).nets.get('GBP')!;
    expect(nets.get(m1.id) ?? 0).toBe(0);
    expect(nets.get(m2.id) ?? 0).toBe(0);
  });

  it('balances are per-currency vectors — EUR and GBP never net against each other', () => {
    const m1 = member('Sam');
    const m2 = member('Alex');
    const eGbp = expense(m1.id, 3000, [m1.id, m2.id]);
    const eEur = expense(m2.id, 8000, [m1.id, m2.id], { currency: 'EUR' } as Partial<ExpenseEvent>);
    const res = balances(effectiveLedger([m1, m2, eGbp, eEur]));
    expect(res.nets.get('GBP')!.get(m2.id)).toBe(-1500);
    expect(res.nets.get('EUR')!.get(m2.id)).toBe(4000);
  });

  it('pairwise shows who owes whom directly, and payments reduce the right edge', () => {
    const m1 = member('Sam');
    const m2 = member('Alex');
    const e = expense(m1.id, 1000, [m1.id, m2.id]); // Alex owes Sam 500
    const p = payment(m2.id, m1.id, 200);
    const debts = pairwiseDebts(effectiveLedger([m1, m2, e, p]));
    expect(debts).toEqual([{ from: m2.id, to: m1.id, currency: 'GBP', minor: 300 }]);
  });
});

describe('event ids', () => {
  it('are 48-bit hex', () => {
    expect(randomEventId()).toMatch(/^[0-9a-f]{12}$/);
  });
});
