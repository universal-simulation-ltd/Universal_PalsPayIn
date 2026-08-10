import { describe, expect, it } from 'vitest';
import {
  decodeLedger, decodeShareFragment, encodeLedger, encodeShareFragment,
  exportJson, importJson, linkSizeVerdict, MEMBER_COLOURS,
} from './codec';
import type { CompactEvent, ExpenseEvent, LedgerEvent, MemberEvent, PaymentEvent } from './events';

let n = 0;
const id = () => (n++).toString(16).padStart(12, '0');

function fullLog(): { groupId: string; name: string; events: LedgerEvent[] } {
  const m1: MemberEvent = { kind: 'member', id: id(), author: 'dev1', at: 1_700_000_000_000, name: 'Sam', colour: MEMBER_COLOURS[0], handle: 'sam-pays' };
  const m2: MemberEvent = { kind: 'member', id: id(), author: 'dev2', at: 1_700_000_001_000, name: 'Alex ✨', colour: '#123456' }; // off-palette colour + non-ASCII
  const e1: ExpenseEvent = {
    kind: 'expense', id: id(), author: 'dev1', at: 1_700_000_002_000, payer: m1.id, minor: 4260, currency: 'GBP',
    date: '2026-08-01', description: 'Taxi', category: 'Travel', split: { mode: 'even', participants: [m1.id, m2.id] },
  };
  const e2: ExpenseEvent = {
    kind: 'expense', id: id(), author: 'dev2', at: 1_700_000_003_000, payer: m2.id, minor: 9000, currency: 'EUR',
    date: '2026-08-02', description: 'Dinner',
    charged: { currency: 'GBP', minor: 7714 },
    split: {
      mode: 'itemised',
      items: [
        { label: 'Steak', minor: 5000, assignees: [m2.id] },
        { label: 'Wine', minor: 3000, assignees: [m1.id, m2.id] },
      ],
      adjustments: [
        { kind: 'tip', minor: 1200, alloc: 'prorata' },
        { kind: 'discount', minor: -200, alloc: { member: m1.id } },
      ],
    },
  };
  const e3: ExpenseEvent = {
    kind: 'expense', id: id(), author: 'dev1', at: 1_700_000_004_000, payer: m1.id, minor: 999, currency: 'GBP',
    date: '2026-08-03', description: 'Snacks', split: { mode: 'exact', amounts: [{ member: m1.id, minor: 500 }, { member: m2.id, minor: 499 }] },
  };
  const e4: ExpenseEvent = {
    kind: 'expense', id: id(), author: 'dev1', at: 1_700_000_005_000, payer: m1.id, minor: 10000, currency: 'JPY',
    date: '2026-08-04', description: 'Museum', split: { mode: 'shares', shares: [{ member: m1.id, weight: 2 }, { member: m2.id, weight: 1 }] },
  };
  const p1: PaymentEvent = {
    kind: 'payment', id: id(), author: 'dev2', at: 1_700_000_006_000, from: m2.id, to: m1.id, minor: 1500, currency: 'GBP',
    date: '2026-08-05', note: 'bank transfer',
  };
  const am = {
    kind: 'amend' as const, id: id(), author: 'dev2', at: 1_700_000_007_000, supersedes: e1.id,
    body: { payer: e1.payer, minor: 4300, currency: 'GBP', date: e1.date, description: 'Taxi (tolls)', split: e1.split },
  };
  const vd = { kind: 'void' as const, id: id(), author: 'dev1', at: 1_700_000_008_000, supersedes: e3.id };
  const cp: CompactEvent = {
    kind: 'compact', id: id(), author: 'dev1', at: 1_700_000_009_000, subsumes: [e4.id],
    opening: [
      { member: m1.id, currency: 'JPY', minor: 3333 },
      { member: m2.id, currency: 'JPY', minor: -3333 },
    ],
  };
  return { groupId: 'a'.repeat(32), name: 'Weekend away 🏖', events: [m1, m2, e1, e2, e3, e4, p1, am, vd, cp] };
}

describe('binary codec', () => {
  it('roundtrips every event kind, every split mode, and non-ASCII text exactly', () => {
    const log = fullLog();
    const decoded = decodeLedger(encodeLedger(log));
    expect(decoded).toEqual(log);
  });

  it('roundtrips through deflate + base64url (the actual share link)', async () => {
    const log = fullLog();
    const fragment = await encodeShareFragment(log);
    expect(fragment).toMatch(/^[A-Za-z0-9_-]+$/); // URL-safe, no padding
    const decoded = await decodeShareFragment(fragment);
    expect(decoded).toEqual(log);
  });

  it('an ordinary expense costs tens of characters, not hundreds', async () => {
    const m1: MemberEvent = { kind: 'member', id: id(), author: 'd', at: 1_700_000_000_000, name: 'Sam', colour: MEMBER_COLOURS[0] };
    const m2: MemberEvent = { kind: 'member', id: id(), author: 'd', at: 1_700_000_000_000, name: 'Alex', colour: MEMBER_COLOURS[1] };
    const events: LedgerEvent[] = [m1, m2];
    const descriptions = ['Groceries', 'Taxi', 'Coffee', 'Dinner', 'Petrol'];
    for (let i = 0; i < 15; i++) {
      events.push({
        kind: 'expense', id: id(), author: 'd', at: 1_700_000_000_000 + i, payer: i % 2 ? m1.id : m2.id,
        minor: 100 + i * 37, currency: 'GBP', date: '2026-08-01', description: descriptions[i % 5],
        split: { mode: 'even', participants: [m1.id, m2.id] },
      });
    }
    const fragment = await encodeShareFragment({ groupId: 'b'.repeat(32), name: 'Weekend', events });
    // The spec's weekend-away scenario (~15 events) must sit well inside a QR.
    expect(fragment.length).toBeLessThan(1000);
    expect(linkSizeVerdict(fragment.length)).toBe('qr');
  });

  it('refuses data from a newer format version rather than misreading it', () => {
    const bytes = encodeLedger(fullLog());
    bytes[3] = 99;
    expect(() => decodeLedger(bytes)).toThrow(/newer/);
  });

  it('refuses garbage', () => {
    expect(() => decodeLedger(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});

describe('size verdict thresholds — the messaging app is the ceiling, not the browser', () => {
  it('green fits a QR, amber survives messaging apps, past that offer the file', () => {
    expect(linkSizeVerdict(300)).toBe('qr');
    expect(linkSizeVerdict(1000)).toBe('qr');
    expect(linkSizeVerdict(1500)).toBe('safe');
    expect(linkSizeVerdict(2001)).toBe('fragile');
  });
});

describe('JSON file export/import', () => {
  it('roundtrips', () => {
    const log = fullLog();
    const back = importJson(exportJson(log));
    expect(back.events).toEqual(log.events);
    expect(back.groupId).toBe(log.groupId);
  });

  it('rejects files that are not a ledger, malformed events, and newer versions', () => {
    expect(() => importJson('{"hello":1}')).toThrow(/Not a PalsPayIn ledger/);
    expect(() => importJson(JSON.stringify({ format: 'palspayin-ledger', version: 2, groupId: 'a'.repeat(32), events: [] }))).toThrow(/newer/);
    expect(() =>
      importJson(JSON.stringify({ format: 'palspayin-ledger', version: 1, groupId: 'a'.repeat(32), events: [{ nonsense: true }] })),
    ).toThrow(/malformed/);
  });
});
