import { useMemo, useState } from 'react';
import type { BalancesResult, PairwiseDebt } from '../lib/balances';
import type { EffectiveLedger, EventId } from '../lib/events';
import { formatAmount } from '../lib/money';
import { chooseSettlePlan } from '../lib/settle';
import PaymentForm from './PaymentForm';
import { card, MemberDot } from './ui';

export default function SettleView({
  ledger,
  bal,
  pairwise,
}: {
  ledger: EffectiveLedger;
  bal: BalancesResult;
  pairwise: PairwiseDebt[];
}) {
  const [recording, setRecording] = useState<{ from: EventId; to: EventId; minor: number; currency: string } | null>(null);
  const [showUnconstrained, setShowUnconstrained] = useState(false);

  const choice = useMemo(() => chooseSettlePlan(bal, pairwise), [bal, pairwise]);
  const nameOf = (id: EventId) => ledger.members.find((m) => m.id === id)?.name ?? 'someone';
  const colourOf = (id: EventId) => ledger.members.find((m) => m.id === id)?.colour ?? '#999';

  if (choice.plan.length === 0) {
    return (
      <section className={card}>
        <p className="text-sm text-slate-600 dark:text-slate-400">All square — there is nothing to settle.</p>
      </section>
    );
  }

  const plan = showUnconstrained ? choice.unconstrainedPlan : choice.plan;
  const n = plan.length;

  // Honest labels, three cases — never "optimal" when it wasn't proved.
  const headline = showUnconstrained
    ? choice.exact || !choice.usedConstrained
      ? `${n} ${n === 1 ? 'transfer' : 'transfers'} — the fewest possible`
      : `${n} ${n === 1 ? 'transfer' : 'transfers'} — close to the fewest`
    : choice.usedConstrained && choice.plan.length > choice.unconstrainedCount
      ? `${n} ${n === 1 ? 'transfer' : 'transfers'} — one more than the theoretical minimum, so nobody pays someone they never owed`
      : choice.exact
        ? `${n} ${n === 1 ? 'transfer' : 'transfers'} — the fewest possible`
        : `${n} ${n === 1 ? 'transfer' : 'transfers'} — close to the fewest`;

  return (
    <div className="space-y-4">
      <section className={card}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{headline}</h2>
          {choice.usedConstrained && choice.plan.length > choice.unconstrainedCount && (
            <button
              type="button"
              className="text-xs font-medium text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
              onClick={() => setShowUnconstrained((v) => !v)}
            >
              {showUnconstrained
                ? 'Back to the plan along existing debts'
                : `Show the ${choice.unconstrainedCount}-transfer version (reshuffles who pays whom)`}
            </button>
          )}
        </div>
        <ul className="space-y-1.5 text-sm">
          {plan.map((t, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
              <span className="text-slate-700 dark:text-slate-300">
                <MemberDot colour={colourOf(t.from)} name={nameOf(t.from)} /> <span className="text-slate-400">pays</span>{' '}
                <MemberDot colour={colourOf(t.to)} name={nameOf(t.to)} />
              </span>
              <span className="flex items-center gap-3">
                <span className="tabular font-semibold text-slate-900 dark:text-slate-100">{formatAmount(t.minor, t.currency)}</span>
                <button
                  type="button"
                  className="no-print rounded-md bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                  onClick={() => setRecording({ from: t.from, to: t.to, minor: t.minor, currency: t.currency })}
                >
                  They've sent it →
                </button>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          This plan is a suggestion computed from the balances — it never changes the ledger. Pay each other in cash or through your
          own banking app, then record it here. Settling in a currency is settling that currency's balance only.
        </p>
      </section>

      {recording && (
        <PaymentForm
          members={ledger.members}
          prefill={recording}
          onClose={() => setRecording(null)}
        />
      )}
    </div>
  );
}
