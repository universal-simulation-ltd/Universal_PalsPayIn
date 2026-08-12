import { useState } from 'react';
import type { EventId, MemberEvent, PaymentEvent } from '../lib/events';
import { allocate } from '../lib/allocate';
import { COMMON_CURRENCIES, formatAmount, parseAmount, currencyExponent } from '../lib/money';
import { useGroupStore, type PaymentFields } from '../stores/groupStore';
import { btnGhost, btnPrimary, card, inputCls, label, selectCls } from './ui';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Not a member id — the sentinel for "everyone else, split equally". It is a
 * shorthand at the form only: saving it writes one ordinary payment event per
 * recipient, so the ledger, the merge rule and the balances never learn a new
 * concept, and any one of those payments can be edited or removed on its own
 * afterwards.
 */
const WHOLE_GROUP = '__group__';

export default function PaymentForm({
  members,
  editing,
  prefill,
  onClose,
}: {
  members: MemberEvent[];
  editing?: PaymentEvent;
  prefill?: { from: EventId; to: EventId; minor: number; currency: string };
  onClose: () => void;
}) {
  const addPayment = useGroupStore((s) => s.addPayment);
  const addPayments = useGroupStore((s) => s.addPayments);
  const amendPayment = useGroupStore((s) => s.amendPayment);

  const src = editing ?? prefill;
  // Paying the group back is the common case — one person covers the taxi and
  // everyone squares up — so it is the default. Editing an existing payment,
  // or settling a specific debt from the Settle up tab, names one person.
  // Not offered when editing: an amend replaces one event, and "split this
  // into three" is not a thing one amend can say.
  const canPayGroup = members.length > 2 && !editing;
  const [from, setFrom] = useState<EventId>(src?.from ?? members[0]?.id ?? '');
  const [to, setTo] = useState<EventId>(src?.to ?? (canPayGroup ? WHOLE_GROUP : (members[1]?.id ?? '')));
  const [amount, setAmount] = useState(src ? minorToText(src.minor, src.currency) : '');
  const [currency, setCurrency] = useState(src?.currency ?? 'GBP');
  const [date, setDate] = useState(editing?.date ?? today());
  const [note, setNote] = useState(editing?.note ?? '');

  const minor = parseAmount(amount, currency);
  const toGroup = to === WHOLE_GROUP;
  const recipients = members.filter((m) => m.id !== from);
  // The share-out is computed here so the form can show it before it is saved:
  // "£30 between three people" should never be a number you find out about
  // afterwards.
  const splitShares =
    toGroup && minor !== null && minor > 0 && recipients.length > 0
      ? allocate(minor, recipients.map(() => 1), `${from}${date}${minor}`)
      : null;

  const canSave =
    minor !== null && minor > 0 && Boolean(from) && (toGroup ? recipients.length > 0 : Boolean(to) && from !== to);

  const onSave = async () => {
    if (!canSave || minor === null) return;
    const common = { currency, date, ...(note.trim() ? { note: note.trim() } : {}) };
    if (toGroup && splitShares) {
      const payments: PaymentFields[] = recipients
        .map((m, i) => ({ from, to: m.id, minor: splitShares[i], ...common }))
        .filter((p) => p.minor > 0); // a share can round to nothing in a big group
      await addPayments(payments);
    } else if (editing) {
      await amendPayment(editing.id, { from, to, minor, ...common });
    } else {
      await addPayment({ from, to, minor, ...common });
    }
    onClose();
  };

  return (
    <section className={`${card} no-print space-y-4`}>
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{editing ? 'Edit payment' : 'Record a payment'}</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          This records that somebody <em>says</em> money was sent — in cash, by bank transfer, however. The app can't confirm it and
          won't pretend to; it never moves money itself.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0">
            <label className={label}>From</label>
            <select className={`${selectCls} w-full`} value={from} onChange={(e) => setFrom(e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className={label}>To</label>
            <select className={`${selectCls} w-full`} value={to} onChange={(e) => setTo(e.target.value)}>
              {canPayGroup && <option value={WHOLE_GROUP}>Whole group (split equally)</option>}
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="min-w-0">
            <label className={label}>Amount</label>
            <input className={`${inputCls} tabular`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="15.00" />
          </div>
          <div className="min-w-0">
            <label className={label}>Currency</label>
            <select className={selectCls} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {(COMMON_CURRENCIES.includes(currency) ? COMMON_CURRENCIES : [currency, ...COMMON_CURRENCIES]).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="min-w-0">
          <label className={label}>Date</label>
          <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className={label}>Note (optional)</label>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="bank transfer" />
        </div>
      </div>

      {toGroup && (
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          {splitShares ? (
            <>
              <p className="mb-1">
                Recorded as {recipients.length} separate payments, split equally — each one can be edited or removed on its own
                afterwards.
              </p>
              <ul className="space-y-0.5">
                {recipients.map((m, i) => (
                  <li key={m.id} className="flex justify-between gap-2">
                    <span>to {m.name}</span>
                    <span className="tabular font-medium">{formatAmount(splitShares[i], currency)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>Split equally between the other {recipients.length} {recipients.length === 1 ? 'person' : 'people'} once you enter an amount.</p>
          )}
        </div>
      )}

      {!toGroup && from === to && from !== '' && <p className="text-sm text-amber-700 dark:text-amber-400">From and to are the same person.</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} disabled={!canSave} onClick={() => void onSave()}>
          {editing ? 'Save changes' : 'Record it'}
        </button>
        <button type="button" className={btnGhost} onClick={onClose}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function minorToText(minor: number, currency: string): string {
  const exp = currencyExponent(currency);
  return exp === 0 ? String(minor) : `${Math.floor(minor / 10 ** exp)}.${String(minor % 10 ** exp).padStart(exp, '0')}`;
}
