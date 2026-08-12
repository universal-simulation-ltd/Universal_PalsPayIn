import { describe, expect, it } from 'vitest';
import { balances } from './balances';
import { effectiveLedger, type ExpenseEvent, type LedgerEvent, type MemberEvent, type PaymentEvent } from './events';
import { groupStats, portfolioStats } from './stats';

let n = 0;
const id = () => (n++).toString(16).padStart(12, '0');

function member(name: string): MemberEvent {
  return { kind: 'member', id: id(), author: 'd', at: 1_700_000_000_000, name, colour: '#0ea5e9' };
}

function stats(events: LedgerEvent[]) {
  const ledger = effectiveLedger(events);
  return groupStats(ledger, balances(ledger));
}

describe('group stats', () => {
  const james = member('James');
  const john = member('John');
  const jenny = member('Jenny');
  // James pays £42.60 evenly three ways: the others owe £14.20 each.
  const taxi: ExpenseEvent = {
    kind: 'expense', id: id(), author: 'd', at: 1_700_000_003_000, payer: james.id, minor: 4260, currency: 'GBP',
    date: '2026-08-01', description: 'Taxi', split: { mode: 'even', participants: [james.id, john.id, jenny.id] },
  };
  const base = [james, john, jenny, taxi];

  it('counts people and entries, and totals the spend per currency', () => {
    const s = stats(base);
    expect(s.members).toBe(3);
    expect(s.expenses).toBe(1);
    expect(s.payments).toBe(0);
    expect(s.totals).toEqual([{ currency: 'GBP', spent: 4260, owed: 2840 }]);
    expect(s.square).toBe(false);
  });

  it('counts what is outstanding once, not once per side of the ledger', () => {
    // £28.40 is owed TO James by two people. The rail must not read £56.80.
    const s = stats(base);
    expect(s.totals[0].owed).toBe(2840);
  });

  it('goes square when the debts are paid off', () => {
    const pay = (from: string): PaymentEvent => ({
      kind: 'payment', id: id(), author: 'd', at: 1_700_000_004_000, from, to: james.id,
      minor: 1420, currency: 'GBP', date: '2026-08-02',
    });
    const s = stats([...base, pay(john.id), pay(jenny.id)]);
    expect(s.payments).toBe(2);
    expect(s.square).toBe(true);
    expect(s.totals).toEqual([{ currency: 'GBP', spent: 4260, owed: 0 }]);
  });

  it('keeps currencies apart rather than netting them', () => {
    const dinner: ExpenseEvent = {
      kind: 'expense', id: id(), author: 'd', at: 1_700_000_005_000, payer: john.id, minor: 3000, currency: 'EUR',
      date: '2026-08-02', description: 'Dinner', split: { mode: 'even', participants: [james.id, john.id, jenny.id] },
    };
    const s = stats([...base, dinner]);
    expect(s.totals.map((t) => t.currency)).toEqual(['EUR', 'GBP']);
    expect(s.totals.find((t) => t.currency === 'EUR')?.spent).toBe(3000);
    expect(s.totals.find((t) => t.currency === 'GBP')?.spent).toBe(4260);
  });

  it('reports the date range of the entries, not of the events', () => {
    const later: ExpenseEvent = { ...taxi, id: id(), at: 1_600_000_000_000, date: '2026-08-09' };
    const s = stats([...base, later]);
    expect(s.first).toBe('2026-08-01');
    expect(s.last).toBe('2026-08-09');
  });

  it('has nothing to say about an empty group beyond that it is empty', () => {
    const s = stats([james, john]);
    expect(s.expenses).toBe(0);
    expect(s.totals).toEqual([]);
    expect(s.first).toBeNull();
  });
});

describe('portfolio stats', () => {
  it('adds groups up per currency and counts the ones still outstanding', () => {
    const a = { members: 3, expenses: 2, payments: 0, totals: [{ currency: 'GBP', spent: 4260, owed: 2840 }], square: false, folded: false, first: '2026-08-01', last: '2026-08-02' };
    const b = { members: 2, expenses: 1, payments: 1, totals: [{ currency: 'GBP', spent: 1000, owed: 0 }, { currency: 'EUR', spent: 3000, owed: 1500 }], square: false, folded: true, first: '2026-08-03', last: '2026-08-04' };
    const c = { members: 4, expenses: 3, payments: 3, totals: [{ currency: 'GBP', spent: 500, owed: 0 }], square: true, folded: false, first: '2026-07-01', last: '2026-07-02' };

    const p = portfolioStats([a, b, c]);
    expect(p.groups).toBe(3);
    expect(p.open).toBe(2);
    expect(p.expenses).toBe(6);
    expect(p.payments).toBe(4);
    expect(p.folded).toBe(true);
    expect(p.totals).toEqual([
      { currency: 'EUR', spent: 3000, owed: 1500 },
      { currency: 'GBP', spent: 5760, owed: 2840 },
    ]);
  });

  it('is empty, not zero-filled, with no groups', () => {
    expect(portfolioStats([])).toEqual({ groups: 0, open: 0, expenses: 0, payments: 0, totals: [], folded: false });
  });
});
