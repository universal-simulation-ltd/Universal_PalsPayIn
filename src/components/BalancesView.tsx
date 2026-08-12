import type { BalancesResult, PairwiseDebt } from '../lib/balances';
import type { EffectiveLedger, EventId } from '../lib/events';
import { formatAmount } from '../lib/money';
import { card, MemberDot } from './ui';

export default function BalancesView({
  ledger,
  bal,
  pairwise,
}: {
  ledger: EffectiveLedger;
  bal: BalancesResult;
  pairwise: PairwiseDebt[];
}) {
  const nameOf = (id: EventId) => ledger.members.find((m) => m.id === id)?.name ?? 'someone';
  const colourOf = (id: EventId) => ledger.members.find((m) => m.id === id)?.colour ?? '#999';
  const currencies = [...bal.nets.keys()].sort();

  if (currencies.length === 0) {
    return (
      <section className={card}>
        <p className="text-sm text-slate-600 dark:text-slate-400">All square — nobody owes anybody anything.</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {currencies.length > 1 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Balances are kept per currency, deliberately. Netting €40 against £15 would need an exchange rate, and asserting one would
          be asserting a fact about your money the app doesn't have.
        </p>
      )}
      {currencies.map((currency) => {
        const nets = [...bal.nets.get(currency)!.entries()].sort((a, b) => b[1] - a[1]);
        const max = Math.max(...nets.map(([, v]) => Math.abs(v)), 1);
        return (
          <section key={currency} className={card}>
            <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{currency}</h2>
            <ul className="space-y-2">
              {nets.map(([member, net]) => (
                <li key={member} className="grid grid-cols-[minmax(0,5rem)_1fr_auto] items-center gap-2 text-sm sm:grid-cols-[8rem_1fr_auto]">
                  <span className="truncate text-slate-700 dark:text-slate-300">
                    <MemberDot colour={colourOf(member)} name={nameOf(member)} />
                  </span>
                  <div className="relative h-4">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300 dark:bg-slate-700" />
                    <div
                      className={`absolute inset-y-0 rounded ${net >= 0 ? 'left-1/2 bg-emerald-400/70' : 'right-1/2 bg-orange-400/70'}`}
                      style={{ width: `${(Math.abs(net) / max) * 48}%` }}
                    />
                  </div>
                  <span className={`tabular whitespace-nowrap font-semibold ${net >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-orange-700 dark:text-orange-400'}`}>
                    {net > 0 ? 'is owed ' : 'owes '}
                    {formatAmount(Math.abs(net), currency)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className={card}>
        <h2 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Who owes whom, directly</h2>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Straight from the expenses as recorded — no simplification. The Settle up tab shows the shortest way out; this is the raw
          truth it is a view of.
        </p>
        {pairwise.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">No outstanding debts between any pair.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {pairwise.map((d, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                <span className="text-slate-700 dark:text-slate-300">
                  <MemberDot colour={colourOf(d.from)} name={nameOf(d.from)} /> <span className="text-slate-400">owes</span>{' '}
                  <MemberDot colour={colourOf(d.to)} name={nameOf(d.to)} />
                </span>
                <span className="tabular font-semibold text-slate-900 dark:text-slate-100">{formatAmount(d.minor, d.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
