import { describe, expect, it } from 'vitest';
import { buildCompact, pruneCompacted } from './compact';
import { effectiveLedger, mergeEvents, type ExpenseEvent, type LedgerEvent, type MemberEvent } from './events';
import { balances } from './balances';

let n = 0;
const id = () => (n++).toString(16).padStart(12, '0');

function member(name: string): MemberEvent {
  return { kind: 'member', id: id(), author: 'dev1', at: 1000, name, colour: '#0ea5e9' };
}
function expense(payer: string, minor: number, participants: string[], date: string): ExpenseEvent {
  return {
    kind: 'expense', id: id(), author: 'dev1', at: 2000, payer, minor, currency: 'GBP',
    date, description: 'x', split: { mode: 'even', participants },
  };
}

function netsOf(events: LedgerEvent[]) {
  const m = balances(effectiveLedger(events)).nets.get('GBP');
  return m ? new Map([...m.entries()].sort()) : new Map();
}

describe('buildCompact + pruneCompacted', () => {
  it('preserves every balance exactly, and pruning shrinks the log', () => {
    const m1 = member('Sam');
    const m2 = member('Alex');
    const m3 = member('Jo');
    const events: LedgerEvent[] = [m1, m2, m3];
    for (let i = 0; i < 20; i++) {
      events.push(expense([m1, m2, m3][i % 3].id, 1000 + i * 7, [m1.id, m2.id, m3.id], i < 15 ? '2026-06-01' : '2026-08-01'));
    }
    const before = netsOf(events);

    const compact = buildCompact(events, '2026-07-01', 'dev1')!;
    expect(compact).not.toBeNull();
    expect(compact.subsumes).toHaveLength(15);
    // Openings sum to zero per currency by construction.
    expect(compact.opening.reduce((a, o) => a + o.minor, 0)).toBe(0);

    const withCompact = [...events, compact];
    expect(netsOf(withCompact)).toEqual(before);

    const pruned = pruneCompacted(withCompact);
    expect(pruned.length).toBe(withCompact.length - 15);
    expect(netsOf(pruned)).toEqual(before);
  });

  it('a stale device re-unioning the pruned log still converges to the same balances', () => {
    const m1 = member('Sam');
    const m2 = member('Alex');
    const events: LedgerEvent[] = [m1, m2];
    for (let i = 0; i < 10; i++) events.push(expense(m1.id, 500, [m1.id, m2.id], '2026-06-01'));
    const before = netsOf(events);

    const compact = buildCompact(events, '2026-07-01', 'dev1')!;
    const pruned = pruneCompacted([...events, compact]);
    // The stale device still holds the full pre-compact log.
    const reunioned = mergeEvents(pruned, events).merged;
    expect(netsOf(reunioned)).toEqual(before);
  });

  it('re-compacting absorbs the earlier compact: openings never double-count', () => {
    const m1 = member('Sam');
    const m2 = member('Alex');
    let events: LedgerEvent[] = [m1, m2];
    for (let i = 0; i < 6; i++) events.push(expense(m1.id, 900, [m1.id, m2.id], '2026-05-01'));
    const c1 = buildCompact(events, '2026-06-01', 'dev1')!;
    events = pruneCompacted([...events, c1]);
    for (let i = 0; i < 6; i++) events.push(expense(m2.id, 300, [m1.id, m2.id], '2026-07-01'));
    const before = netsOf(events);

    const c2 = buildCompact(events, '2026-08-01', 'dev1')!;
    expect(c2.subsumes).toContain(c1.id);
    const after = pruneCompacted([...events, c2]);
    expect(netsOf(after)).toEqual(before);
    // Only the new compact's openings remain live.
    expect(effectiveLedger(after).entries).toHaveLength(0);
  });

  it('returns null when there is nothing to retire', () => {
    const m1 = member('Sam');
    expect(buildCompact([m1], '2026-01-01', 'dev1')).toBeNull();
  });
});
