import { describe, expect, it } from 'vitest';
import { cleanHandle, payOptions } from './paylinks';
import { dueOccurrence, type RecurringTemplate } from './recurring';

describe('pay links — the §18.4-permitted shapes and nothing more', () => {
  it('only PayPal carries an amount; the label and note never overpromise', () => {
    const opts = payOptions({ paypal: 'sam-pays', monzo: 'samm', revolut: 'samr', bank: 'Sort 04-00-04, acct 12345678' }, 4260, 'GBP');
    expect(opts).toHaveLength(4);

    const paypal = opts.find((o) => o.kind === 'paypal')!;
    expect(paypal.url).toBe('https://paypal.me/sam-pays/42.60GBP');
    expect(paypal.carriesAmount).toBe(true);

    const monzo = opts.find((o) => o.kind === 'monzo')!;
    expect(monzo.url).toBe('https://monzo.me/samm');
    expect(monzo.carriesAmount).toBe(false);
    expect(monzo.copyText).toBe('42.60'); // the amount rides on the clipboard, and the note says so
    expect(monzo.note).toMatch(/can't carry an amount/);

    const bank = opts.find((o) => o.kind === 'bank')!;
    expect(bank.url).toBeUndefined(); // no UK payment-link standard — honestly a copy
    expect(bank.copyText).toContain('£42.60');
  });

  it('zero-exponent currencies format without decimals', () => {
    const [paypal] = payOptions({ paypal: 'sam' }, 1200, 'JPY');
    expect(paypal.url).toBe('https://paypal.me/sam/1200JPY');
  });

  it('cleanHandle strips pasted URLs, @s and trailing paths', () => {
    expect(cleanHandle('https://paypal.me/sam-pays')).toBe('sam-pays');
    expect(cleanHandle('https://www.monzo.me/samm?x=1')).toBe('samm');
    expect(cleanHandle('@samr')).toBe('samr');
    expect(cleanHandle('sam/extra')).toBe('sam');
  });

  it('empty or missing handles produce no options', () => {
    expect(payOptions(undefined, 100, 'GBP')).toHaveLength(0);
    expect(payOptions({ paypal: '  ' }, 100, 'GBP')).toHaveLength(0);
  });
});

describe('recurring — nudges only, monthly, skipped months stay skipped', () => {
  const base: RecurringTemplate = {
    id: 'x', description: 'Rent', minor: 80000, currency: 'GBP', payer: 'aaaaaaaaaaaa',
    split: { mode: 'even', participants: ['aaaaaaaaaaaa'] }, dayOfMonth: 1, createdOn: '2026-06-15',
  };

  it('is due on the day itself and after it, until added', () => {
    expect(dueOccurrence(base, '2026-07-01')).toBe('2026-07-01');
    expect(dueOccurrence(base, '2026-07-20')).toBe('2026-07-01');
  });

  it('is not due before the first occurrence after creation', () => {
    expect(dueOccurrence(base, '2026-06-20')).toBe(null); // June's day-1 predates creation
  });

  it('adding (or skipping) an occurrence silences it until the next month', () => {
    const added = { ...base, lastAdded: '2026-07-01' };
    expect(dueOccurrence(added, '2026-07-25')).toBe(null);
    expect(dueOccurrence(added, '2026-08-01')).toBe('2026-08-01');
  });

  it('only ever surfaces the most recent occurrence — no invoice backlog', () => {
    // Created in June, never added, opened in September: one nudge (September's), not three.
    expect(dueOccurrence(base, '2026-09-10')).toBe('2026-09-01');
  });

  it('clamps the day into 1–28', () => {
    expect(dueOccurrence({ ...base, dayOfMonth: 31 }, '2026-07-29')).toBe('2026-07-28');
  });
});
