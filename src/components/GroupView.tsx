import { useEffect, useMemo, useState } from 'react';
import { useGroupStore } from '../stores/groupStore';
import { effectiveLedger } from '../lib/events';
import { balances, pairwiseDebts } from '../lib/balances';
import { dueOccurrence, type RecurringTemplate } from '../lib/recurring';
import { formatAmount } from '../lib/money';
import EntryList from './EntryList';
import ExpenseForm from './ExpenseForm';
import PaymentForm from './PaymentForm';
import BalancesView from './BalancesView';
import SettleView from './SettleView';
import ShareView from './ShareView';
import MembersEditor from './MembersEditor';
import { btnGhost, btnPrimary } from './ui';

type Tab = 'entries' | 'balances' | 'settle' | 'share';

const SYNC_INTERVAL_MS = 30_000;

export default function GroupView({ groupId }: { groupId: string }) {
  const group = useGroupStore((s) => s.groups.find((g) => g.groupId === groupId));
  const syncNow = useGroupStore((s) => s.syncNow);
  const [tab, setTab] = useState<Tab>('entries');
  const [adding, setAdding] = useState<'expense' | 'payment' | null>(null);
  const [showMembers, setShowMembers] = useState(false);

  const eff = useMemo(() => (group ? effectiveLedger(group.events) : null), [group]);
  const bal = useMemo(() => (eff ? balances(eff) : null), [eff]);
  const pairwise = useMemo(() => (eff ? pairwiseDebts(eff) : []), [eff]);

  // Relay polling while the group is open. Sync is also triggered by every
  // local append, so this only catches OTHER devices' writes.
  useEffect(() => {
    if (!group?.relayEnabled) return;
    void syncNow();
    const t = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, group?.relayEnabled]);

  if (!group || !eff || !bal) return null;

  const tabs: { id: Tab; title: string }[] = [
    { id: 'entries', title: 'Expenses' },
    { id: 'balances', title: 'Balances' },
    { id: 'settle', title: 'Settle up' },
    { id: 'share', title: 'Share & sync' },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold break-words text-slate-900 sm:text-2xl dark:text-slate-100">{group.name}</h1>
          <button
            type="button"
            onClick={() => setShowMembers((v) => !v)}
            className="mt-0.5 text-xs font-medium text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
          >
            {eff.members.length} people {showMembers ? '▴' : '▾'}
          </button>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={() => setAdding('expense')}>
            Add expense
          </button>
          <button type="button" className={btnGhost} onClick={() => setAdding('payment')}>
            Record a payment
          </button>
        </div>
      </header>

      {bal.corruptCurrencies.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          Something is wrong: the {bal.corruptCurrencies.join(', ')} balances do not sum to zero, which should be impossible.
          This ledger may be corrupt — check the history rather than trusting the numbers below.
        </div>
      )}

      {group.example && <ExampleBanner groupId={group.groupId} />}

      {showMembers && <MembersEditor members={eff.members} />}

      <RecurringNudges />

      {adding === 'expense' && <ExpenseForm members={eff.members} onClose={() => setAdding(null)} />}
      {adding === 'payment' && <PaymentForm members={eff.members} onClose={() => setAdding(null)} />}

      {/* Two-up on a phone: four tabs in one row only fit by scrolling, and a
          tab you have to discover by swiping is a tab nobody finds. */}
      <nav className="no-print grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-900">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`truncate rounded-lg px-3 py-2 text-sm font-medium transition ${
              tab === t.id
                ? 'bg-orange-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {t.title}
          </button>
        ))}
      </nav>

      {tab === 'entries' && <EntryList group={group} ledger={eff} />}
      {tab === 'balances' && <BalancesView ledger={eff} bal={bal} pairwise={pairwise} />}
      {tab === 'settle' && <SettleView ledger={eff} bal={bal} pairwise={pairwise} groupName={group.name} />}
      {tab === 'share' && <ShareView group={group} ledger={eff} />}
    </div>
  );
}

/**
 * The sample group says so on its face — an example nobody realises is an
 * example is just confusing data, and the way out has to be one tap, not a
 * hunt through the Share tab.
 */
function ExampleBanner({ groupId }: { groupId: string }) {
  const removeGroup = useGroupStore((s) => s.removeGroup);
  return (
    <div className="no-print flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-300 border-dashed bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
      <p className="max-w-3xl">
        <strong className="font-semibold">This is an example</strong> — Sam, Alex and Jo away for the weekend. The dinner is split{' '}
        <em>item by item</em>, so everyone pays for what they ate and the service charge follows those amounts; the reservation fee is
        split <em>evenly</em>, because that one really is the same for everybody. Change anything you like, or bin it and start your own.
      </p>
      <button
        type="button"
        onClick={() => void removeGroup(groupId)}
        className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-white dark:border-slate-700 dark:hover:bg-slate-800"
      >
        Delete example
      </button>
    </div>
  );
}

/**
 * "It's the 1st — add the rent?" Templates only ever NUDGE; nothing is added
 * without a tap, and a skipped month stays skipped. If two housemates both
 * add it, the duplicate-suspicion prompt catches it at merge — by design.
 */
function RecurringNudges() {
  const activeId = useGroupStore((s) => s.activeId);
  const group = useGroupStore((s) => s.groups.find((g) => g.groupId === s.activeId));
  const addOccurrence = useGroupStore((s) => s.addOccurrence);
  const skipOccurrence = useGroupStore((s) => s.skipOccurrence);
  if (!activeId || !group?.recurring?.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const due = group.recurring
    .map((t) => ({ t, due: dueOccurrence(t, today) }))
    .filter((x): x is { t: RecurringTemplate; due: string } => x.due !== null);
  if (due.length === 0) return null;
  return (
    <div className="no-print space-y-2">
      {due.map(({ t, due: dueDate }) => (
        <div
          key={t.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-200"
        >
          <span>
            <strong>{t.description}</strong> ({formatAmount(t.minor, t.currency)}, monthly on day {t.dayOfMonth}) is due for {dueDate}.
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              className="rounded-md bg-orange-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-orange-500"
              onClick={() => void addOccurrence(t.id, dueDate)}
            >
              Add it
            </button>
            <button
              type="button"
              className="rounded-md px-2.5 py-1 text-xs font-medium underline-offset-2 hover:underline"
              onClick={() => void skipOccurrence(t.id, dueDate)}
            >
              Skip this month
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
