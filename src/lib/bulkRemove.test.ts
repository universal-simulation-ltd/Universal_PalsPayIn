import { beforeEach, describe, expect, it, vi } from 'vitest';

// The store saves to IndexedDB; here it saves nowhere, so the store's own
// voidEntry / voidEntries run exactly as in the app.
vi.mock('./store', () => ({
  saveGroup: async () => {},
  loadGroups: async () => [],
  deleteGroup: async () => {},
  deletePhoto: async () => {},
  deviceId: () => 'dev1',
}));

import { effectiveLedger, voidEvents, type ExpenseEvent, type LedgerEvent, type MemberEvent, type PaymentEvent } from './events';
import { balances, pairwiseDebts } from './balances';
import { chooseSettlePlan } from './settle';
import { groupStats } from './stats';
import type { StoredGroup } from './store';
import { useGroupStore } from '../stores/groupStore';

let n = 0;
const id = () => (n++).toString(16).padStart(12, '0');
const member = (name: string): MemberEvent => ({ kind: 'member', id: id(), author: 'dev1', at: 1000, name, colour: '#0ea5e9' });
const expense = (payer: string, minor: number, split: ExpenseEvent['split'], over: Partial<ExpenseEvent> = {}): ExpenseEvent => ({
  kind: 'expense', id: id(), author: 'dev1', at: 2000, payer, minor, currency: 'GBP', date: '2026-08-01', description: 'Taxi', split, ...over,
});
const payment = (from: string, to: string, minor: number, over: Partial<PaymentEvent> = {}): PaymentEvent => ({
  kind: 'payment', id: id(), author: 'dev1', at: 3000, from, to, minor, currency: 'GBP', date: '2026-08-02', ...over,
});

/** Everything the screen shows that removing entries changes. */
function summary(events: LedgerEvent[]) {
  const eff = effectiveLedger(events);
  const bal = balances(eff);
  const pairwise = pairwiseDebts(eff);
  const nets = [...bal.nets].map(([cur, m]) => [cur, [...m].sort()] as const).sort();
  return {
    entries: eff.entries.map((e) => e.id).sort(),
    nets,
    corrupt: bal.corruptCurrencies,
    pairwise,
    stats: groupStats(eff, bal),
    plan: chooseSettlePlan(bal, pairwise).plan,
  };
}

function ledger() {
  const sam = member('Sam');
  const alex = member('Alex');
  const jo = member('Jo');
  const dinner = expense(sam.id, 9_000, { mode: 'even', participants: [sam.id, alex.id, jo.id] }, { description: 'Dinner' });
  const hotel = expense(alex.id, 24_001, { mode: 'shares', shares: [{ member: sam.id, weight: 2 }, { member: alex.id, weight: 1 }, { member: jo.id, weight: 1 }] });
  const fuel = expense(jo.id, 6_350, { mode: 'exact', amounts: [{ member: sam.id, minor: 3_000 }, { member: jo.id, minor: 3_350 }] });
  const museum = expense(sam.id, 4_000, { mode: 'even', participants: [alex.id, jo.id] }, { currency: 'EUR' });
  const payBack = payment(jo.id, sam.id, 3_000);
  const payEur = payment(alex.id, sam.id, 2_000, { currency: 'EUR' });
  // An entry edited after it was made: removing it removes the edited version.
  const amend: LedgerEvent = { kind: 'amend', id: id(), author: 'dev1', at: 4000, supersedes: fuel.id, body: { payer: jo.id, minor: 7_000, currency: 'GBP', date: '2026-08-01', description: 'Fuel', split: { mode: 'even', participants: [sam.id, jo.id] } } };
  const events: LedgerEvent[] = [sam, alex, jo, dinner, hotel, fuel, museum, payBack, payEur, amend];
  return { events, remove: [dinner.id, fuel.id, payEur.id, museum.id], keep: [hotel.id, payBack.id] };
}

let at = 5000;
const make = () => ({ id: id(), author: 'dev1', at: at++ });

describe('removing several entries at once', () => {
  it('leaves the same balances, debts, totals and settle plan as removing them one by one', () => {
    const { events, remove, keep } = ledger();

    const together = summary([...events, ...voidEvents(remove, make)]);

    let oneByOne = events;
    for (const entry of remove) oneByOne = [...oneByOne, ...voidEvents([entry], make)];
    const separately = summary(oneByOne);

    expect(together).toEqual(separately);
    expect(together.entries).toEqual([...keep].sort());
    expect(together.corrupt).toEqual([]);
    // And the balances really did change: nothing was a no-op.
    expect(together.nets).not.toEqual(summary(events).nets);
  });

  it('is the same as the entries never having been there', () => {
    const { events, remove } = ledger();
    const gone = new Set(remove);
    const without = events.filter((e) => !gone.has(e.id) && !(e.kind === 'amend' && gone.has(e.supersedes)));
    const withVoids = summary([...events, ...voidEvents(remove, make)]);
    const neverThere = summary(without);
    expect(withVoids.nets).toEqual(neverThere.nets);
    expect(withVoids.pairwise).toEqual(neverThere.pairwise);
    expect(withVoids.plan).toEqual(neverThere.plan);
  });

  it('writes one void per entry, and a repeated id only once', () => {
    const voids = voidEvents(['a', 'b', 'a'], make);
    expect(voids.map((v) => v.supersedes)).toEqual(['a', 'b']);
    expect(new Set(voids.map((v) => v.id)).size).toBe(2);
    expect(voids.every((v) => v.kind === 'void')).toBe(true);
  });
});

describe('the store: voidEntries against voidEntry', () => {
  const start = (events: LedgerEvent[]): StoredGroup => ({ groupId: 'g1', name: 'Bath', events, createdAt: 0, updatedAt: 0 });

  beforeEach(() => {
    useGroupStore.setState({ groups: [], activeId: null });
  });

  it('removing in one go and removing one at a time end at the same balances', async () => {
    const { events, remove } = ledger();

    useGroupStore.setState({ groups: [start(events)], activeId: 'g1' });
    await useGroupStore.getState().voidEntries(remove);
    const bulk = useGroupStore.getState().groups[0].events;

    useGroupStore.setState({ groups: [start(events)], activeId: 'g1' });
    for (const entry of remove) await useGroupStore.getState().voidEntry(entry);
    const single = useGroupStore.getState().groups[0].events;

    // Same number of events appended (one void each), same meaning.
    expect(bulk.length).toBe(events.length + remove.length);
    expect(single.length).toBe(bulk.length);
    expect(summary(bulk)).toEqual(summary(single));
  });
});
