import { useMemo, useState } from 'react';
import type { EventId, ExpenseEvent, MemberEvent, SplitSpec } from '../lib/events';
import { COMMON_CURRENCIES, currencyExponent, formatAmount, parseAmount } from '../lib/money';
import { splitProblem } from '../lib/split';
import { useGroupStore, type ExpenseFields } from '../stores/groupStore';
import { btnGhost, btnPrimary, card, inputCls, label, selectCls, MemberDot } from './ui';

type Mode = 'even' | 'exact' | 'shares' | 'percent' | 'itemised';

interface ItemDraft {
  label: string;
  amount: string;
  assignees: EventId[];
}
interface AdjDraft {
  kind: 'tax' | 'tip' | 'service' | 'discount';
  amount: string;
  alloc: 'prorata' | 'even' | EventId; // member id = assigned to one person
}

const today = () => new Date().toISOString().slice(0, 10);

export default function ExpenseForm({
  members,
  editing,
  onClose,
}: {
  members: MemberEvent[];
  /** When set, saving writes an amend of this expense instead of a new one. */
  editing?: ExpenseEvent;
  onClose: () => void;
}) {
  const addExpense = useGroupStore((s) => s.addExpense);
  const amendExpense = useGroupStore((s) => s.amendExpense);

  const [payer, setPayer] = useState<EventId>(editing?.payer ?? members[0]?.id ?? '');
  const [amount, setAmount] = useState(editing ? minorToText(editing.minor, editing.currency) : '');
  const [currency, setCurrency] = useState(editing?.currency ?? 'GBP');
  const [date, setDate] = useState(editing?.date ?? today());
  const [description, setDescription] = useState(editing?.description ?? '');
  const [category, setCategory] = useState(editing?.category ?? '');
  const [mode, setMode] = useState<Mode>(initialMode(editing?.split));
  const [participants, setParticipants] = useState<EventId[]>(
    editing?.split.mode === 'even' ? editing.split.participants : members.map((m) => m.id),
  );
  const [exactAmounts, setExactAmounts] = useState<Record<EventId, string>>(() => initialExact(editing));
  const [weights, setWeights] = useState<Record<EventId, string>>(() => initialWeights(editing, members));
  const [percents, setPercents] = useState<Record<EventId, string>>(() => initialPercents(editing));
  const [items, setItems] = useState<ItemDraft[]>(() => initialItems(editing));
  const [adjustments, setAdjustments] = useState<AdjDraft[]>(() => initialAdjs(editing));
  const [showCharged, setShowCharged] = useState(Boolean(editing?.charged));
  const [chargedCurrency, setChargedCurrency] = useState(editing?.charged?.currency ?? 'GBP');
  const [chargedAmount, setChargedAmount] = useState(editing?.charged ? minorToText(editing.charged.minor, editing.charged.currency) : '');

  const minor = parseAmount(amount, currency);

  const split: SplitSpec | null = useMemo(() => {
    try {
      if (mode === 'even') return { mode: 'even', participants };
      if (mode === 'exact') {
        return {
          mode: 'exact',
          amounts: members
            .filter((m) => (exactAmounts[m.id] ?? '').trim() !== '')
            .map((m) => ({ member: m.id, minor: parseAmount(exactAmounts[m.id], currency) ?? NaN })),
        };
      }
      if (mode === 'shares') {
        return {
          mode: 'shares',
          shares: members
            .filter((m) => (weights[m.id] ?? '').trim() !== '' && Number(weights[m.id]) > 0)
            .map((m) => ({ member: m.id, weight: Math.floor(Number(weights[m.id])) })),
        };
      }
      if (mode === 'percent') {
        return {
          mode: 'shares',
          shares: members
            .filter((m) => (percents[m.id] ?? '').trim() !== '')
            .map((m) => ({ member: m.id, weight: Math.round(Number(percents[m.id]) * 100) })), // basis points
        };
      }
      return {
        mode: 'itemised',
        items: items.map((i) => ({ label: i.label.trim() || 'Item', minor: parseAmount(i.amount, currency) ?? NaN, assignees: i.assignees })),
        adjustments: adjustments.map((a) => ({
          kind: a.kind,
          minor: applySign(a.kind, parseAmount(a.amount, currency) ?? NaN),
          alloc: a.alloc === 'prorata' || a.alloc === 'even' ? a.alloc : { member: a.alloc },
        })),
      };
    } catch {
      return null;
    }
  }, [mode, participants, exactAmounts, weights, percents, items, adjustments, members, currency]);

  const percentSum = mode === 'percent' ? members.reduce((a, m) => a + (Number(percents[m.id]) || 0), 0) : 100;
  const hasNaN =
    split !== null &&
    ((split.mode === 'exact' && split.amounts.some((a) => Number.isNaN(a.minor))) ||
      (split.mode === 'itemised' &&
        (split.items.some((i) => Number.isNaN(i.minor)) || split.adjustments.some((a) => Number.isNaN(a.minor)))));

  const problem =
    minor === null || minor <= 0
      ? amount.trim() === ''
        ? 'Enter the amount.'
        : `Not a valid ${currency} amount.`
      : description.trim() === ''
        ? 'Give it a description.'
        : mode === 'percent' && Math.abs(percentSum - 100) > 1e-9
          ? `Percentages add to ${round2(percentSum)}%, not 100% — the app won't guess who absorbs the difference.`
          : split === null || hasNaN
            ? 'Fill in every amount.'
            : splitProblem(split, minor)?.replace(String(minor), formatAmount(minor, currency));

  const chargedMinor = showCharged ? parseAmount(chargedAmount, chargedCurrency) : null;
  const chargedProblem = showCharged && (chargedMinor === null || chargedMinor <= 0 || chargedCurrency === currency);

  const canSave = !problem && !chargedProblem && payer !== '';

  const onSave = async () => {
    if (!canSave || !split || minor === null) return;
    const fields: ExpenseFields = {
      payer,
      minor,
      currency,
      date,
      description: description.trim(),
      split,
      ...(category.trim() ? { category: category.trim() } : {}),
      ...(showCharged && chargedMinor ? { charged: { currency: chargedCurrency, minor: chargedMinor } } : {}),
    };
    if (editing) await amendExpense(editing.id, fields);
    else await addExpense(fields);
    onClose();
  };

  const modeButtons: { id: Mode; title: string }[] = [
    { id: 'even', title: 'Evenly' },
    { id: 'exact', title: 'Exact amounts' },
    { id: 'shares', title: 'Shares' },
    { id: 'percent', title: 'Percent' },
    { id: 'itemised', title: 'Item by item' },
  ];

  return (
    <section className={`${card} no-print space-y-4`}>
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{editing ? 'Edit expense' : 'Add an expense'}</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Description</label>
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Taxi from the airport" autoFocus />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div>
            <label className={label}>Amount</label>
            <input className={`${inputCls} tabular`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="42.60" />
          </div>
          <div>
            <label className={label}>Currency</label>
            <CurrencySelect value={currency} onChange={setCurrency} />
          </div>
        </div>
        <div>
          <label className={label}>Paid by</label>
          <select className={`${selectCls} w-full`} value={payer} onChange={(e) => setPayer(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label}>Date</label>
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className={label}>Category (optional)</label>
            <input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Food" />
          </div>
        </div>
      </div>

      <div>
        <label className={label}>Split</label>
        <div className="flex flex-wrap gap-1">
          {modeButtons.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                mode === m.id ? 'bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {m.title}
            </button>
          ))}
        </div>
      </div>

      {mode === 'even' && (
        <div className="flex flex-wrap gap-2">
          {members.map((m) => {
            const on = participants.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setParticipants((p) => (on ? p.filter((x) => x !== m.id) : [...p, m.id]))}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  on
                    ? 'border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200'
                    : 'border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400'
                }`}
              >
                <MemberDot colour={m.colour} name={m.name} />
              </button>
            );
          })}
        </div>
      )}

      {(mode === 'exact' || mode === 'shares' || mode === 'percent') && (
        <div className="grid gap-2 sm:grid-cols-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <span className="w-32 truncate text-sm text-slate-700 dark:text-slate-300">
                <MemberDot colour={m.colour} name={m.name} />
              </span>
              <input
                className={`${inputCls} tabular`}
                inputMode="decimal"
                placeholder={mode === 'exact' ? '0.00' : mode === 'percent' ? '%' : 'shares'}
                value={(mode === 'exact' ? exactAmounts : mode === 'shares' ? weights : percents)[m.id] ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (mode === 'exact') setExactAmounts((s) => ({ ...s, [m.id]: v }));
                  else if (mode === 'shares') setWeights((s) => ({ ...s, [m.id]: v }));
                  else setPercents((s) => ({ ...s, [m.id]: v }));
                }}
              />
            </div>
          ))}
          {mode === 'percent' && (
            <p className={`text-xs ${Math.abs(percentSum - 100) > 1e-9 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500'}`}>
              Total: {round2(percentSum)}%
            </p>
          )}
        </div>
      )}

      {mode === 'itemised' && (
        <ItemisedEditor
          members={members}
          currency={currency}
          totalMinor={minor}
          items={items}
          setItems={setItems}
          adjustments={adjustments}
          setAdjustments={setAdjustments}
        />
      )}

      <div>
        <button type="button" className="text-xs font-medium text-slate-500 underline-offset-2 hover:underline dark:text-slate-400" onClick={() => setShowCharged((v) => !v)}>
          {showCharged ? '▾' : '▸'} Paid on a card in a different currency?
        </button>
        {showCharged && (
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 sm:max-w-sm">
            <div>
              <label className={label}>What the card was actually charged</label>
              <input className={`${inputCls} tabular`} inputMode="decimal" value={chargedAmount} onChange={(e) => setChargedAmount(e.target.value)} placeholder="36.90" />
            </div>
            <div>
              <label className={label}>In</label>
              <CurrencySelect value={chargedCurrency} onChange={setChargedCurrency} />
            </div>
            <p className="col-span-2 text-xs text-slate-500 dark:text-slate-400">
              The bill stays in {currency}; the implied rate is shown, never guessed.
              {chargedMinor && minor ? ` (${formatAmount(chargedMinor, chargedCurrency)} for ${formatAmount(minor, currency)})` : ''}
            </p>
          </div>
        )}
      </div>

      {problem && amount.trim() !== '' && description.trim() !== '' && (
        <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{problem}</p>
      )}

      <div className="flex gap-2">
        <button type="button" className={btnPrimary} disabled={!canSave} onClick={() => void onSave()}>
          {editing ? 'Save changes' : 'Add expense'}
        </button>
        <button type="button" className={btnGhost} onClick={onClose}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function ItemisedEditor({
  members,
  currency,
  totalMinor,
  items,
  setItems,
  adjustments,
  setAdjustments,
}: {
  members: MemberEvent[];
  currency: string;
  totalMinor: number | null;
  items: ItemDraft[];
  setItems: (fn: (v: ItemDraft[]) => ItemDraft[]) => void;
  adjustments: AdjDraft[];
  setAdjustments: (fn: (v: AdjDraft[]) => AdjDraft[]) => void;
}) {
  const itemSum = items.reduce((a, i) => a + (parseAmount(i.amount, currency) ?? 0), 0);
  const adjSum = adjustments.reduce((a, j) => a + applySign(j.kind, parseAmount(j.amount, currency) ?? 0), 0);
  const diff = totalMinor !== null ? totalMinor - itemSum - adjSum : null;

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      {items.map((item, idx) => (
        <div key={idx} className="space-y-1.5">
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="Steak"
              value={item.label}
              onChange={(e) => setItems((v) => v.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))}
            />
            <input
              className={`${inputCls} tabular max-w-28`}
              inputMode="decimal"
              placeholder="0.00"
              value={item.amount}
              onChange={(e) => setItems((v) => v.map((x, i) => (i === idx ? { ...x, amount: e.target.value } : x)))}
            />
            <button
              type="button"
              className="text-slate-400 hover:text-red-600"
              aria-label="Remove item"
              onClick={() => setItems((v) => v.filter((_, i) => i !== idx))}
            >
              ✕
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => {
              const on = item.assignees.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    setItems((v) =>
                      v.map((x, i) =>
                        i === idx ? { ...x, assignees: on ? x.assignees.filter((a) => a !== m.id) : [...x.assignees, m.id] } : x,
                      ),
                    )
                  }
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    on
                      ? 'border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200'
                      : 'border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400'
                  }`}
                >
                  {m.name}
                </button>
              );
            })}
            {item.assignees.length === 0 && (
              <span className="text-xs text-amber-700 dark:text-amber-400">Who had this? Unassigned items are an error, not “everyone”.</span>
            )}
          </div>
        </div>
      ))}
      <button type="button" className="text-sm font-medium text-orange-700 hover:underline dark:text-orange-400" onClick={() => setItems((v) => [...v, { label: '', amount: '', assignees: [] }])}>
        + Add item
      </button>

      {adjustments.map((adj, idx) => (
        <div key={idx} className="flex flex-wrap items-center gap-2">
          <select
            className={selectCls}
            value={adj.kind}
            onChange={(e) => setAdjustments((v) => v.map((x, i) => (i === idx ? { ...x, kind: e.target.value as AdjDraft['kind'] } : x)))}
          >
            <option value="tax">Tax</option>
            <option value="tip">Tip</option>
            <option value="service">Service charge</option>
            <option value="discount">Discount</option>
          </select>
          <input
            className={`${inputCls} tabular max-w-28`}
            inputMode="decimal"
            placeholder="0.00"
            value={adj.amount}
            onChange={(e) => setAdjustments((v) => v.map((x, i) => (i === idx ? { ...x, amount: e.target.value } : x)))}
          />
          <select
            className={selectCls}
            value={typeof adj.alloc === 'string' ? adj.alloc : adj.alloc}
            onChange={(e) => setAdjustments((v) => v.map((x, i) => (i === idx ? { ...x, alloc: e.target.value as AdjDraft['alloc'] } : x)))}
          >
            <option value="prorata">split in proportion</option>
            <option value="even">split evenly</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                paid by {m.name} alone
              </option>
            ))}
          </select>
          <button type="button" className="text-slate-400 hover:text-red-600" aria-label="Remove adjustment" onClick={() => setAdjustments((v) => v.filter((_, i) => i !== idx))}>
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-sm font-medium text-orange-700 hover:underline dark:text-orange-400"
        onClick={() => setAdjustments((v) => [...v, { kind: 'tip', amount: '', alloc: 'prorata' }])}
      >
        + Add tax / tip / service / discount
      </button>

      {diff !== null && diff !== 0 && (
        <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
          Items + adjustments are {formatAmount(Math.abs(diff), currency)} {diff > 0 ? 'short of' : 'over'} the bill total. The app won't
          add a “rounding” line for you — fix the total or the items.
        </p>
      )}
    </div>
  );
}

function CurrencySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const list = COMMON_CURRENCIES.includes(value) ? COMMON_CURRENCIES : [value, ...COMMON_CURRENCIES];
  return (
    <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
      {list.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

function applySign(kind: AdjDraft['kind'], minor: number): number {
  // Users type discounts as a positive number; the ledger stores them negative.
  return kind === 'discount' ? -Math.abs(minor) : minor;
}

function minorToText(minor: number, currency: string): string {
  const exp = currencyExponent(currency);
  const abs = Math.abs(minor);
  const s = exp === 0 ? String(abs) : `${Math.floor(abs / 10 ** exp)}.${String(abs % 10 ** exp).padStart(exp, '0')}`;
  return minor < 0 ? `-${s}` : s;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function initialMode(split?: SplitSpec): Mode {
  if (!split) return 'even';
  if (split.mode === 'shares') {
    const sum = split.shares.reduce((a, s) => a + s.weight, 0);
    return sum === 10_000 ? 'percent' : 'shares';
  }
  return split.mode;
}

function initialExact(editing?: ExpenseEvent): Record<EventId, string> {
  if (editing?.split.mode !== 'exact') return {};
  return Object.fromEntries(editing.split.amounts.map((a) => [a.member, minorToText(a.minor, editing.currency)]));
}

function initialWeights(editing: ExpenseEvent | undefined, members: MemberEvent[]): Record<EventId, string> {
  if (editing?.split.mode === 'shares') {
    return Object.fromEntries(editing.split.shares.map((s) => [s.member, String(s.weight)]));
  }
  return Object.fromEntries(members.map((m) => [m.id, '1']));
}

function initialPercents(editing?: ExpenseEvent): Record<EventId, string> {
  if (editing?.split.mode !== 'shares') return {};
  const sum = editing.split.shares.reduce((a, s) => a + s.weight, 0);
  if (sum !== 10_000) return {};
  return Object.fromEntries(editing.split.shares.map((s) => [s.member, String(s.weight / 100)]));
}

function initialItems(editing?: ExpenseEvent): ItemDraft[] {
  if (editing?.split.mode !== 'itemised') return [{ label: '', amount: '', assignees: [] }];
  return editing.split.items.map((i) => ({ label: i.label, amount: minorToText(i.minor, editing.currency), assignees: [...i.assignees] }));
}

function initialAdjs(editing?: ExpenseEvent): AdjDraft[] {
  if (editing?.split.mode !== 'itemised') return [];
  return editing.split.adjustments.map((a) => ({
    kind: a.kind,
    amount: minorToText(Math.abs(a.minor), editing.currency),
    alloc: a.alloc === 'prorata' || a.alloc === 'even' ? a.alloc : a.alloc.member,
  }));
}
