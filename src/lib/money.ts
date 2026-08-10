// Money is an integer count of minor units. There is no floating-point value
// anywhere in the ledger, at any point, ever. `assertMinor` guards every
// arithmetic path; a non-integer here means a bug upstream, not a rounding
// preference.

/** ISO 4217 currencies whose minor-unit exponent is NOT 2. */
const EXPONENT_0 = new Set(['JPY', 'KRW', 'CLP', 'VND', 'ISK', 'XOF', 'XAF', 'XPF']);
const EXPONENT_3 = new Set(['BHD', 'KWD', 'JOD', 'OMR', 'TND', 'IQD', 'LYD']);

/** Currencies offered in the picker; any valid ISO code typed in still works. */
export const COMMON_CURRENCIES = [
  'GBP', 'EUR', 'USD', 'AUD', 'CAD', 'CHF', 'JPY', 'NZD', 'SEK', 'NOK',
  'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'AED', 'THB', 'INR', 'ZAR', 'MXN',
];

export function currencyExponent(code: string): number {
  if (EXPONENT_0.has(code)) return 0;
  if (EXPONENT_3.has(code)) return 3;
  return 2;
}

export function assertMinor(n: number, context: string): number {
  if (!Number.isSafeInteger(n)) {
    throw new Error(`Non-integer money in ${context}: ${n}`);
  }
  return n;
}

/** Parse user input like "42.60" into minor units for a currency. null = invalid. */
export function parseAmount(text: string, currency: string): number | null {
  const exp = currencyExponent(currency);
  const trimmed = text.trim().replace(/,/g, '');
  if (!/^-?\d*(\.\d*)?$/.test(trimmed) || trimmed === '' || trimmed === '-' || trimmed === '.') return null;
  const neg = trimmed.startsWith('-');
  const body = neg ? trimmed.slice(1) : trimmed;
  const [whole = '0', frac = ''] = body.split('.');
  if (frac.length > exp) return null; // more precision than the currency has
  const minor = parseInt(whole || '0', 10) * 10 ** exp + parseInt(frac.padEnd(exp, '0') || '0', 10);
  if (!Number.isSafeInteger(minor)) return null;
  return neg ? -minor : minor;
}

/** Format minor units for display, e.g. 4260 GBP -> "£42.60". */
export function formatAmount(minor: number, currency: string, opts?: { sign?: boolean }): string {
  assertMinor(minor, 'formatAmount');
  const exp = currencyExponent(currency);
  const neg = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 10 ** exp);
  const frac = String(abs % 10 ** exp).padStart(exp, '0');
  const symbol = CURRENCY_SYMBOLS[currency];
  const num = exp === 0 ? String(whole) : `${whole.toLocaleString('en-GB')}.${frac}`;
  const prefix = neg ? '-' : opts?.sign ? '+' : '';
  return symbol ? `${prefix}${symbol}${num}` : `${prefix}${num} ${currency}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: '£', EUR: '€', USD: '$', JPY: '¥', AUD: 'A$', CAD: 'C$', NZD: 'NZ$', INR: '₹', TRY: '₺', THB: '฿',
};

/**
 * A user-supplied exchange rate, stored exactly as typed: `amount` in `from`
 * currency was worth `equals` in `to` currency. Never a float, never fetched.
 */
export interface UserRate {
  from: string;
  fromMinor: number;
  to: string;
  toMinor: number;
}
