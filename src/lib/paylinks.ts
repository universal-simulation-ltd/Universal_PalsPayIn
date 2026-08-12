// Outbound deep links to the user's OWN payment apps — the §18.4-permitted
// shape and nothing more: the user reviews and authorises inside that app,
// and we never learn the outcome.
//
// Only PayPal.me can carry an amount in a link a third party constructs.
// Monzo.me and Revolut.me are handle-only (Monzo's amount-bearing request
// links are minted inside the Monzo app), so those options put the amount on
// the clipboard and SAY SO — a button labelled "Pay £15" that opens a blank
// amount field is the kind of small lie that makes users distrust the
// balances too. There is no UK equivalent of the SEPA EPC QR code, so bank
// transfer is honestly "copy the details", not a link that looks like it
// will do something.

import type { BankAccount, MemberHandles } from './events';
import { bankAccountFilled } from './events';
import { currencyExponent, formatAmount } from './money';

export interface PayOption {
  kind: 'cash' | 'paypal' | 'monzo' | 'revolut' | 'bank';
  /** Button label. Never claims more than the mechanism delivers. */
  label: string;
  url?: string;
  /** Text to put on the clipboard when clicked (amount, or bank details). */
  copyText?: string;
  carriesAmount: boolean;
  /** One honest sentence shown beside the button. */
  note: string;
}

/** Strip pasted URLs / @ / slashes down to the bare handle. */
export function cleanHandle(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?(paypal\.me|monzo\.me|revolut\.me)\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .trim();
}

function decimalAmount(minor: number, currency: string): string {
  const exp = currencyExponent(currency);
  return exp === 0 ? String(minor) : `${Math.floor(minor / 10 ** exp)}.${String(minor % 10 ** exp).padStart(exp, '0')}`;
}

/**
 * Bank details as a person reads them out, one per line. Structured fields
 * first, then whatever they typed in the free-text box — both, if they filled
 * in both, because dropping half someone's details to keep the output tidy is
 * how a transfer goes to the wrong account.
 */
export function bankDetailsText(handles: MemberHandles | undefined): string | null {
  if (!handles) return null;
  const a: BankAccount = handles.bankAccount ?? {};
  const lines = [
    a.name?.trim() && `Account name: ${a.name.trim()}`,
    a.sortCode?.trim() && `Sort code: ${a.sortCode.trim()}`,
    a.number?.trim() && `Account number: ${a.number.trim()}`,
    a.reference?.trim() && `Reference: ${a.reference.trim()}`,
    handles.bank?.trim(),
  ].filter((x): x is string => Boolean(x));
  return lines.length > 0 ? lines.join('\n') : null;
}

export function payOptions(handles: MemberHandles | undefined, minor: number, currency: string): PayOption[] {
  if (!handles) return [];
  const out: PayOption[] = [];
  const amount = decimalAmount(minor, currency);
  const pretty = formatAmount(minor, currency);

  if (handles.cash) {
    out.push({
      kind: 'cash',
      label: 'Cash is fine',
      copyText: pretty,
      carriesAmount: false,
      // No link, no app, nothing to open — the button exists so the ledger can
      // say which methods were offered, and so the amount is one tap away.
      note: `They said cash suits them. Hand it over, then record it here — ${pretty} is on your clipboard if you need it.`,
    });
  }
  if (handles.paypal) {
    const h = cleanHandle(handles.paypal);
    if (h) {
      out.push({
        kind: 'paypal',
        label: `Open PayPal — ${pretty} filled in`,
        url: `https://paypal.me/${encodeURIComponent(h)}/${amount}${currency}`,
        carriesAmount: true,
        note: 'You review and send inside PayPal. The app never learns whether it went through.',
      });
    }
  }
  if (handles.monzo) {
    const h = cleanHandle(handles.monzo);
    if (h) {
      out.push({
        kind: 'monzo',
        label: 'Open their Monzo.me page',
        url: `https://monzo.me/${encodeURIComponent(h)}`,
        copyText: amount,
        carriesAmount: false,
        note: `Monzo.me links can't carry an amount from outside Monzo — ${pretty} is on your clipboard to paste.`,
      });
    }
  }
  if (handles.revolut) {
    const h = cleanHandle(handles.revolut);
    if (h) {
      out.push({
        kind: 'revolut',
        label: 'Open their Revolut page',
        url: `https://revolut.me/${encodeURIComponent(h)}`,
        copyText: amount,
        carriesAmount: false,
        note: `Revolut links are handle-only — ${pretty} is on your clipboard to paste.`,
      });
    }
  }
  if (handles.bank?.trim() || bankAccountFilled(handles.bankAccount)) {
    out.push({
      kind: 'bank',
      label: 'Copy their bank details',
      copyText: `${bankDetailsText(handles)}\nAmount: ${pretty}`,
      carriesAmount: false,
      note: 'Paste into your own banking app. There is no UK payment-link standard, so this is honestly a copy, not a link.',
    });
  }
  return out;
}
