import type { EffectiveLedger, EventId, ExpenseEvent } from './events';
import { computeShares } from './split';
import { currencyExponent } from './money';

/**
 * CSV of the effective ledger: one row per expense/payment, one column per
 * member carrying their signed effect on that entry (credits positive).
 * Amounts are decimal strings derived from integer minor units — the floats
 * never exist in the ledger, only in the text.
 */
export function ledgerCsv(ledger: EffectiveLedger): string {
  const members = ledger.members;
  const head = ['Date', 'Type', 'Description', 'Category', 'Currency', 'Amount', 'Paid by', ...members.map((m) => m.name)];
  const rows: string[][] = [head];

  const dec = (minor: number, currency: string) => {
    const exp = currencyExponent(currency);
    const neg = minor < 0 ? '-' : '';
    const abs = Math.abs(minor);
    return exp === 0 ? `${neg}${abs}` : `${neg}${Math.floor(abs / 10 ** exp)}.${String(abs % 10 ** exp).padStart(exp, '0')}`;
  };
  const nameOf = (id: EventId) => members.find((m) => m.id === id)?.name ?? 'Unknown';

  for (const e of ledger.entries) {
    const effects = new Map<EventId, number>();
    if (e.kind === 'expense') {
      effects.set(e.payer, (effects.get(e.payer) ?? 0) + e.minor);
      for (const [m, share] of computeShares(e as ExpenseEvent)) effects.set(m, (effects.get(m) ?? 0) - share);
      rows.push([
        e.date, 'Expense', e.description, e.category ?? '', e.currency, dec(e.minor, e.currency), nameOf(e.payer),
        ...members.map((m) => (effects.has(m.id) ? dec(effects.get(m.id)!, e.currency) : '')),
      ]);
    } else {
      effects.set(e.from, e.minor);
      effects.set(e.to, -e.minor);
      rows.push([
        e.date, 'Payment', `${nameOf(e.from)} marked as sent to ${nameOf(e.to)}`, '', e.currency, dec(e.minor, e.currency), nameOf(e.from),
        ...members.map((m) => (effects.has(m.id) ? dec(effects.get(m.id)!, e.currency) : '')),
      ]);
    }
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
