import { describe, expect, it } from 'vitest';
import { sharesFor, splitProblem } from './split';
import type { SplitSpec } from './events';

const A = 'aaaaaaaaaaaa';
const B = 'bbbbbbbbbbbb';
const C = 'cccccccccccc';

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe('split modes all reduce to allocate and sum exactly', () => {
  it('even', () => {
    const shares = sharesFor({ mode: 'even', participants: [A, B, C] }, 1000, 'e1');
    expect(sum(shares)).toBe(1000);
    expect([...shares.values()].sort((a, b) => b - a)).toEqual([334, 333, 333]);
  });

  it('exact must sum to the total or be refused — never silently normalised', () => {
    const good: SplitSpec = { mode: 'exact', amounts: [{ member: A, minor: 700 }, { member: B, minor: 300 }] };
    expect(sum(sharesFor(good, 1000, 's'))).toBe(1000);
    const bad: SplitSpec = { mode: 'exact', amounts: [{ member: A, minor: 700 }, { member: B, minor: 200 }] };
    expect(() => sharesFor(bad, 1000, 's')).toThrow(/sum to 900/);
    expect(splitProblem(bad, 1000)).toMatch(/900/);
  });

  it('percentages are basis points; 33/33/34 sums, 33/33/33 is refused upstream by the UI sum check', () => {
    const spec: SplitSpec = {
      mode: 'shares',
      shares: [
        { member: A, weight: 3300 },
        { member: B, weight: 3300 },
        { member: C, weight: 3400 },
      ],
    };
    const shares = sharesFor(spec, 1000, 'p');
    expect(sum(shares)).toBe(1000);
    expect(shares.get(C)).toBe(340);
  });

  it('shares: 2/1/1 of £10.01 leaves no penny behind', () => {
    const spec: SplitSpec = {
      mode: 'shares',
      shares: [
        { member: A, weight: 2 },
        { member: B, weight: 1 },
        { member: C, weight: 1 },
      ],
    };
    expect(sum(sharesFor(spec, 1001, 'x'))).toBe(1001);
  });
});

describe('itemised bills — the format worst case, and the most checkable', () => {
  const items: Extract<SplitSpec, { mode: 'itemised' }>['items'] = [
    { label: 'Steak', minor: 2400, assignees: [A] },
    { label: 'Pasta', minor: 1200, assignees: [B] },
    { label: 'Wine', minor: 1800, assignees: [A, B, C] },
  ];

  it('prorated tax and tip land in proportion to pre-adjustment subtotals, and sum exactly', () => {
    const spec: SplitSpec = {
      mode: 'itemised',
      items,
      adjustments: [
        { kind: 'service', minor: 540, alloc: 'prorata' }, // 10%
      ],
    };
    const shares = sharesFor(spec, 5940, 'bill');
    expect(sum(shares)).toBe(5940);
    // A's subtotal 2400+600=3000 of 5400 → gets 300 of the 540 service.
    expect(shares.get(A)).toBe(3300);
  });

  it('a discount prorates identically with a negative total', () => {
    const spec: SplitSpec = {
      mode: 'itemised',
      items,
      adjustments: [{ kind: 'discount', minor: -540, alloc: 'prorata' }],
    };
    const shares = sharesFor(spec, 4860, 'bill');
    expect(sum(shares)).toBe(4860);
    expect(shares.get(A)).toBe(2700);
  });

  it('an adjustment can be assigned to one person', () => {
    const spec: SplitSpec = {
      mode: 'itemised',
      items,
      adjustments: [{ kind: 'tip', minor: 500, alloc: { member: C } }],
    };
    const shares = sharesFor(spec, 5900, 'bill');
    expect(shares.get(C)).toBe(600 + 500);
  });

  it('an item with no assignees is an error, not an even split', () => {
    const spec: SplitSpec = {
      mode: 'itemised',
      items: [{ label: 'Steak', minor: 2400, assignees: [] }],
      adjustments: [],
    };
    expect(() => sharesFor(spec, 2400, 'bill')).toThrow(/no one assigned/);
  });

  it('the check line: items + adjustments must equal the bill total — the app shows the difference and refuses to guess', () => {
    const spec: SplitSpec = { mode: 'itemised', items, adjustments: [] };
    expect(() => sharesFor(spec, 6000, 'bill')).toThrow(/≠ bill total/);
    expect(splitProblem(spec, 5400)).toBe(null);
  });
});
