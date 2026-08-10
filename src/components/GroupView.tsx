import { useEffect, useMemo, useState } from 'react';
import { useGroupStore } from '../stores/groupStore';
import { effectiveLedger } from '../lib/events';
import { balances, pairwiseDebts } from '../lib/balances';
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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{group.name}</h1>
          <button
            type="button"
            onClick={() => setShowMembers((v) => !v)}
            className="mt-0.5 text-xs font-medium text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
          >
            {eff.members.length} people {showMembers ? '▴' : '▾'}
          </button>
        </div>
        <div className="no-print flex gap-2">
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

      {showMembers && <MembersEditor members={eff.members} />}

      {adding === 'expense' && <ExpenseForm members={eff.members} onClose={() => setAdding(null)} />}
      {adding === 'payment' && <PaymentForm members={eff.members} onClose={() => setAdding(null)} />}

      <nav className="no-print flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
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
      {tab === 'settle' && <SettleView ledger={eff} bal={bal} pairwise={pairwise} />}
      {tab === 'share' && <ShareView group={group} ledger={eff} />}
    </div>
  );
}
