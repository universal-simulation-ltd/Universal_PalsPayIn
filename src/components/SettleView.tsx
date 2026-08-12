import { useMemo, useState } from 'react';
import type { BalancesResult } from '../lib/balances';
import type { EffectiveLedger, EventId } from '../lib/events';
import { PAY_METHODS, offersMethod } from '../lib/events';
import { formatAmount } from '../lib/money';
import { payOptions } from '../lib/paylinks';
import type { SettleChoice, Transfer } from '../lib/settle';
import { settlementMessage } from '../lib/summary';
import PaymentForm from './PaymentForm';
import { card, checkboxCls, CopyButton, MemberDot, ScrollFade } from './ui';

export default function SettleView({
  ledger,
  bal,
  choice,
  groupName,
}: {
  ledger: EffectiveLedger;
  bal: BalancesResult;
  /** Computed by the parent — the summary rail shows the transfer count on
   *  every tab, and the exact search is too expensive to run twice. */
  choice: SettleChoice;
  groupName: string;
}) {
  const [recording, setRecording] = useState<{ from: EventId; to: EventId; minor: number; currency: string } | null>(null);
  const [showUnconstrained, setShowUnconstrained] = useState(false);

  const nameOf = (id: EventId) => ledger.members.find((m) => m.id === id)?.name ?? 'someone';
  const colourOf = (id: EventId) => ledger.members.find((m) => m.id === id)?.colour ?? '#999';

  if (choice.plan.length === 0) {
    return (
      <div className="space-y-4">
        <section className={card}>
          <p className="text-sm text-slate-600 dark:text-slate-400">All square — there is nothing to settle.</p>
        </section>
        {/* Worth sending too: "we're square" is the message that ends the thread. */}
        <ShareSummary groupName={groupName} ledger={ledger} bal={bal} plan={[]} />
      </div>
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
            <TransferRow
              key={i}
              transfer={t}
              ledger={ledger}
              nameOf={nameOf}
              colourOf={colourOf}
              onRecord={() => setRecording({ from: t.from, to: t.to, minor: t.minor, currency: t.currency })}
            />
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          This plan is a suggestion computed from the balances — it never changes the ledger. Pay each other in cash or through your
          own banking app, then record it here. Settling in a currency is settling that currency's balance only.
        </p>
      </section>

      <ShareSummary groupName={groupName} ledger={ledger} bal={bal} plan={plan} />

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

/**
 * The message you paste into the group chat. Built from the same balances and
 * the same plan that are on screen above it, so there is no second source of
 * truth to drift — and shown in full before it is copied, because a button
 * that puts text you have not read onto your clipboard and then into a group
 * chat is a button nobody should trust.
 */
function ShareSummary({
  groupName,
  ledger,
  bal,
  plan,
}: {
  groupName: string;
  ledger: EffectiveLedger;
  bal: BalancesResult;
  plan: Transfer[];
}) {
  const [includePayDetails, setIncludePayDetails] = useState(true);

  const payeesWithDetails = useMemo(() => {
    const payees = new Set(plan.map((t) => t.to));
    return ledger.members.filter((m) => payees.has(m.id) && PAY_METHODS.some((k) => offersMethod(m.handles, k)));
  }, [plan, ledger.members]);

  const message = useMemo(
    () => settlementMessage({ groupName, ledger, bal, plan, includePayDetails: includePayDetails && payeesWithDetails.length > 0 }),
    [groupName, ledger, bal, plan, includePayDetails, payeesWithDetails.length],
  );

  return (
    <section className={`${card} no-print`}>
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Send it to the group</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        The state of play as plain text, ready to paste into the group chat. Read it before you send it — it is yours, not a
        notification this app sends on your behalf.
      </p>

      {payeesWithDetails.length > 0 ? (
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" className={checkboxCls} checked={includePayDetails} onChange={(e) => setIncludePayDetails(e.target.checked)} />
          Include how to pay {new Intl.ListFormat('en-GB').format(payeesWithDetails.map((m) => m.name))}
        </label>
      ) : (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          To offer cash or bank details in this message, tap the people count under the group name and add them there.
        </p>
      )}

      <ScrollFade axis="y" className="mt-3 max-h-72 rounded-lg bg-slate-50 dark:bg-slate-800/60">
        <pre className="p-3 font-sans text-xs whitespace-pre-wrap text-slate-700 dark:text-slate-200">{message}</pre>
      </ScrollFade>

      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton text={message} label="Copy the message" />
      </div>
    </section>
  );
}

/**
 * One transfer row: the amount, the "pay them" deep links the payee chose to
 * share (§18.4 shapes only — the user authorises inside their own app and we
 * never learn the outcome), and the record-a-claim button. After a pay
 * option fires, the row asks "did that go through?" — recording the answer
 * as an assertion, never a verification.
 */
function TransferRow({
  transfer: t,
  ledger,
  nameOf,
  colourOf,
  onRecord,
}: {
  transfer: Transfer;
  ledger: EffectiveLedger;
  nameOf: (id: EventId) => string;
  colourOf: (id: EventId) => string;
  onRecord: () => void;
}) {
  const [showPay, setShowPay] = useState(false);
  const [fired, setFired] = useState(false);
  const payee = ledger.members.find((m) => m.id === t.to);
  const options = payOptions(payee?.handles, t.minor, t.currency);

  return (
    <li className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-slate-700 dark:text-slate-300">
          <MemberDot colour={colourOf(t.from)} name={nameOf(t.from)} /> <span className="text-slate-400">pays</span>{' '}
          <MemberDot colour={colourOf(t.to)} name={nameOf(t.to)} />
        </span>
        <span className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="tabular font-semibold whitespace-nowrap text-slate-900 dark:text-slate-100">{formatAmount(t.minor, t.currency)}</span>
          {options.length > 0 && (
            <button
              type="button"
              className="no-print rounded-md bg-orange-100 px-2 py-1 text-xs font-medium text-orange-800 hover:bg-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:hover:bg-orange-900/60"
              onClick={() => setShowPay((v) => !v)}
            >
              Pay {nameOf(t.to)} {showPay ? '▴' : '▾'}
            </button>
          )}
          <button
            type="button"
            className="no-print rounded-md bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            onClick={onRecord}
          >
            They've sent it →
          </button>
        </span>
      </div>
      {showPay && (
        <div className="no-print mt-2 space-y-1.5 border-t border-slate-200 pt-2 dark:border-slate-700">
          {options.map((o) => (
            <div key={o.kind} className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-orange-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                onClick={() => {
                  if (o.copyText) void navigator.clipboard.writeText(o.copyText);
                  if (o.url) window.open(o.url, '_blank', 'noopener');
                  setFired(true);
                }}
              >
                {o.label}
              </button>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">{o.note}</span>
            </div>
          ))}
          {fired && (
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Did that go through? The app can't tell.{' '}
              <button type="button" className="font-semibold text-orange-700 underline underline-offset-2 dark:text-orange-400" onClick={onRecord}>
                Record it as sent
              </button>
            </p>
          )}
        </div>
      )}
    </li>
  );
}
