import { useState } from 'react';
import type { EventId, MemberEvent, PaymentEvent } from '../lib/events';
import { COMMON_CURRENCIES, parseAmount, currencyExponent } from '../lib/money';
import { useGroupStore } from '../stores/groupStore';
import { btnGhost, btnPrimary, card, inputCls, label, selectCls } from './ui';

const today = () => new Date().toISOString().slice(0, 10);

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
  const amendPayment = useGroupStore((s) => s.amendPayment);

  const src = editing ?? prefill;
  const [from, setFrom] = useState<EventId>(src?.from ?? members[0]?.id ?? '');
  const [to, setTo] = useState<EventId>(src?.to ?? members[1]?.id ?? '');
  const [amount, setAmount] = useState(src ? minorToText(src.minor, src.currency) : '');
  const [currency, setCurrency] = useState(src?.currency ?? 'GBP');
  const [date, setDate] = useState(editing?.date ?? today());
  const [note, setNote] = useState(editing?.note ?? '');

  const minor = parseAmount(amount, currency);
  const canSave = minor !== null && minor > 0 && from !== to && from && to;

  const onSave = async () => {
    if (!canSave || minor === null) return;
    const fields = { from, to, minor, currency, date, ...(note.trim() ? { note: note.trim() } : {}) };
    if (editing) await amendPayment(editing.id, fields);
    else await addPayment(fields);
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

      {from === to && from !== '' && <p className="text-sm text-amber-700 dark:text-amber-400">From and to are the same person.</p>}

      <div className="flex gap-2">
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
