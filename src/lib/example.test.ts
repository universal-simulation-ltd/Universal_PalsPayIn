import { describe, expect, it } from 'vitest';
import { buildExampleGroup } from './example';
import { effectiveLedger, type ExpenseEvent } from './events';
import { balances } from './balances';
import { computeShares } from './split';

// The example is the first thing many people will see, so a split that does
// not add up here is a split that does not add up in public. `computeShares`
// throws on an inconsistent spec, which is exactly the assertion wanted.

const TODAY = '2026-08-12';

describe('the built-in example group', () => {
  const group = buildExampleGroup(TODAY, 'testdev');
  const eff = effectiveLedger(group.events);
  const by = (name: string) => eff.members.find((m) => m.name === name)!.id;
  const expense = (description: string) =>
    eff.entries.find((e): e is ExpenseEvent => e.kind === 'expense' && e.description === description)!;

  it('is three people, two expenses and a payment claim', () => {
    expect(eff.members.map((m) => m.name)).toEqual(['Sam', 'Alex', 'Jo']);
    expect(eff.entries.filter((e) => e.kind === 'expense')).toHaveLength(2);
    expect(eff.entries.filter((e) => e.kind === 'payment')).toHaveLength(1);
  });

  it('splits the dinner unevenly — what each of them ate, plus prorated service', () => {
    const dinner = expense('Dinner at The Old Mill');
    const shares = computeShares(dinner); // throws unless items + service = the total
    expect(shares.get(by('Sam'))).toBe(3769); // 24.50 steak + 9.00 wine + 4.19 service
    expect(shares.get(by('Alex'))).toBe(2813);
    expect(shares.get(by('Jo'))).toBe(2756);
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(dinner.minor);
  });

  it('splits the reservation fee dead evenly', () => {
    expect([...computeShares(expense('Table reservation fee')).values()]).toEqual([1000, 1000, 1000]);
  });

  it('leaves a settle-up worth looking at, in one currency, netting to zero', () => {
    const { nets, corruptCurrencies } = balances(eff);
    expect(corruptCurrencies).toEqual([]);
    expect([...nets.keys()]).toEqual(['GBP']);
    const gbp = nets.get('GBP')!;
    expect(gbp.get(by('Sam'))).toBe(2569); // paid 93.38, owes 37.69 + 10.00, and Jo has sent 20.00 back
    expect(gbp.get(by('Alex'))).toBe(-813);
    expect(gbp.get(by('Jo'))).toBe(-1756);
  });

  it('dates itself relative to today, so it never looks abandoned', () => {
    expect(eff.entries.map((e) => e.date)).toEqual(['2026-08-03', '2026-08-10', '2026-08-11']);
  });
});
