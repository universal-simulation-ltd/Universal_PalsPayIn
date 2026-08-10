import { useState } from 'react';
import type { EventId } from '../lib/events';
import { formatAmount } from '../lib/money';
import { useGroupStore, type PendingSuspicions } from '../stores/groupStore';
import { btnGhost, btnPrimary, card } from './ui';

/**
 * "Did you get the taxi? I got the taxi." Two same-looking expenses arrived
 * in a merge. They might be one bill entered twice — or two genuine identical
 * bills — and NO merge rule can tell those apart, so the app asks and never
 * decides on its own.
 */
export default function MergeReview({ pending }: { pending: PendingSuspicions }) {
  const resolveSuspicions = useGroupStore((s) => s.resolveSuspicions);
  // For each suspicious pair: keep both (default) or void one.
  const [choices, setChoices] = useState<(EventId | null)[]>(pending.suspicions.map(() => null));

  const apply = () => {
    void resolveSuspicions(choices.filter((c): c is EventId => c !== null));
  };

  return (
    <section className={`${card} no-print mb-4 border-amber-300 dark:border-amber-800`}>
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {pending.suspicions.length === 1 ? 'These two look like the same bill' : 'Some of these look like the same bill entered twice'}
      </h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        The merge brought in {pending.suspicions.length === 1 ? 'an expense' : 'expenses'} matching {pending.suspicions.length === 1 ? 'one' : 'ones'} already here — same payer,
        same amount, within two days. They could also be two genuine identical bills; only you know. Nothing is removed unless you say so.
      </p>
      <ul className="mt-3 space-y-3">
        {pending.suspicions.map((s, i) => (
          <li key={`${s.a.id}-${s.b.id}`} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
            <p className="text-slate-700 dark:text-slate-300">
              “{s.a.description}” on {s.a.date} and “{s.b.description}” on {s.b.date} — both {formatAmount(s.a.minor, s.a.currency)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {([
                [null, 'Keep both'],
                [s.b.id, `Remove the incoming one (“${s.b.description}”, ${s.b.date})`],
                [s.a.id, `Remove the existing one (“${s.a.description}”, ${s.a.date})`],
              ] as const).map(([value, text]) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setChoices((c) => c.map((x, j) => (j === i ? value : x)))}
                  className={`rounded-full border px-3 py-1 font-medium ${
                    choices[i] === value
                      ? 'border-orange-400 bg-orange-50 text-orange-900 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-200'
                      : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <button type="button" className={btnPrimary} onClick={apply}>
          Apply
        </button>
        <button type="button" className={btnGhost} onClick={() => void resolveSuspicions([])}>
          Keep everything
        </button>
      </div>
    </section>
  );
}
