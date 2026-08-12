import { useMemo, useState } from 'react';
import { useFileDrop } from '@unisim/sdk';
import { useGroupStore } from '../stores/groupStore';
import { balances } from '../lib/balances';
import { effectiveLedger } from '../lib/events';
import { formatAmount } from '../lib/money';
import { groupStats, portfolioStats, type GroupStats } from '../lib/stats';
import type { StoredGroup } from '../lib/store';
import { PortfolioRail } from './StatsRail';
import { btnDanger, btnGhost, btnPrimary, card, inputCls, label } from './ui';

export default function GroupList() {
  const groups = useGroupStore((s) => s.groups);
  const open = useGroupStore((s) => s.open);
  const createGroup = useGroupStore((s) => s.createGroup);
  const importFile = useGroupStore((s) => s.importFile);
  const loadExample = useGroupStore((s) => s.loadExample);
  const removeGroup = useGroupStore((s) => s.removeGroup);

  const [name, setName] = useState('');
  const [members, setMembers] = useState('');
  const [creating, setCreating] = useState(groups.length === 0);
  const [importError, setImportError] = useState<string | null>(null);
  /** The group whose ✕ has been pressed — deleting is one tap away, but never one tap. */
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const importPicker = useFileDrop({
    onFiles: (files) => { if (files[0]) void onFile(files[0]); },
    accept: 'application/json,.json',
    multiple: false,
    clickToBrowse: false,
  });

  // One pass over every ledger, feeding both the cards and the rail beside
  // them. The settle-up PLAN is deliberately not computed here: it is an exact
  // search per group, and the landing page would pay for all of them at once.
  const rows = useMemo(
    () =>
      groups.map((g) => {
        const ledger = effectiveLedger(g.events);
        return { group: g, stats: groupStats(ledger, balances(ledger)) };
      }),
    [groups],
  );
  const portfolio = useMemo(() => portfolioStats(rows.map((r) => r.stats)), [rows]);

  const memberNames = members.split(/[,\n]/).map((m) => m.trim()).filter(Boolean);
  const canCreate = name.trim().length > 0 && memberNames.length >= 2;

  const onCreate = async () => {
    if (!canCreate) return;
    await createGroup(name, memberNames);
  };

  const onFile = async (file: File) => {
    setImportError(null);
    try {
      await importFile(await file.text());
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not read that file.');
    }
  };

  const startPanel = (
    <section className={card}>
      {!creating ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>
            New group
          </button>
          <button type="button" className={btnGhost} onClick={importPicker.open}>
            Import a ledger file…
          </button>
          <button type="button" className={btnGhost} onClick={() => void loadExample()}>
            Load an example
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400">Got a share link instead? Just open it — it lands here by itself.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">New group</h2>
          <div>
            <label className={label} htmlFor="group-name">
              Group name
            </label>
            <input id="group-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekend away" autoFocus />
          </div>
          <div>
            <label className={label} htmlFor="group-members">
              Who's in it? (comma-separated — just names, no emails, no accounts)
            </label>
            <input
              id="group-members"
              className={inputCls}
              value={members}
              onChange={(e) => setMembers(e.target.value)}
              placeholder="Sam, Alex, Jo"
            />
            {members.trim() !== '' && memberNames.length < 2 && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">A split needs at least two people.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} disabled={!canCreate} onClick={() => void onCreate()}>
              Create group
            </button>
            {groups.length > 0 && (
              <button type="button" className={btnGhost} onClick={() => setCreating(false)}>
                Cancel
              </button>
            )}
            <button type="button" className={btnGhost} onClick={importPicker.open}>
              Import a ledger file…
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Not sure how a split should look?{' '}
            <button
              type="button"
              onClick={() => void loadExample()}
              className="font-semibold text-orange-700 underline underline-offset-2 hover:text-orange-600 dark:text-orange-400"
            >
              Load an example
            </button>{' '}
            — a worked dinner-and-booking weekend for three you can poke at, then delete.
          </p>
        </div>
      )}
      {importError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{importError}</p>}
      {/* The hook clears the value after every pick, so the same ledger file
          can be re-imported. */}
      <input {...importPicker.inputProps} className="hidden" />
    </section>
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Split bills with friends</h1>
        <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Log who paid for what, split it evenly, exactly, by shares or item by item, and settle up in the fewest transfers.
          Everything stays in this browser unless you share it. No account, no ads — and the app <strong>never moves money</strong>.
        </p>
      </header>

      {/* Two columns at desktop widths, 2:1 — the groups and the way in on the
          left, the numbers they add up to on the right. Below `lg` it is one
          column and the rail falls under the list, where a summary belongs on a
          phone. With no groups yet there is nothing to summarise, so the whole
          grid collapses to the single "start here" panel. */}
      {rows.length === 0 ? (
        startPanel
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <ul className="grid gap-3 sm:grid-cols-2">
              {rows.map(({ group, stats }) => (
                <li key={group.groupId}>
                  {confirmDelete === group.groupId ? (
                    <DeleteConfirm
                      group={group}
                      onCancel={() => setConfirmDelete(null)}
                      onConfirm={() => {
                        setConfirmDelete(null);
                        void removeGroup(group.groupId);
                      }}
                    />
                  ) : (
                    <GroupCard
                      group={group}
                      stats={stats}
                      onOpen={() => open(group.groupId)}
                      onDelete={() => setConfirmDelete(group.groupId)}
                    />
                  )}
                </li>
              ))}
            </ul>
            {startPanel}
          </div>

          <aside className="space-y-4 self-start lg:sticky lg:top-6">
            <PortfolioRail stats={portfolio} />
          </aside>
        </div>
      )}
    </div>
  );
}

/**
 * A group card, with its own ✕.
 *
 * The ✕ is a SIBLING of the card button, positioned over its corner, not a
 * child: a button inside a button is invalid HTML, and browsers resolve it by
 * dropping one of them — which one is not something to find out in the field.
 */
function GroupCard({
  group,
  stats,
  onOpen,
  onDelete,
}: {
  group: StoredGroup;
  stats: GroupStats;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const entries = stats.expenses + stats.payments;
  const outstanding = stats.totals.filter((t) => t.owed > 0);
  return (
    <div className="relative h-full">
      <button
        type="button"
        onClick={onOpen}
        // A button centres its content vertically by default, so a card
        // stretched to match a taller neighbour in the row would float its
        // title down the middle. Flex column, top-aligned, pins it back.
        className={`${card} flex h-full w-full flex-col items-stretch justify-start text-left transition hover:border-orange-300 dark:hover:border-orange-800`}
      >
        {/* pr-8 keeps the title clear of the ✕ sitting over this corner. */}
        <div className="flex items-center justify-between gap-2 pr-8">
          <h2 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{group.name}</h2>
          {group.relayEnabled && (
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
              encrypted sync on
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {stats.members} {stats.members === 1 ? 'person' : 'people'} · {entries} {entries === 1 ? 'entry' : 'entries'}
        </p>
        {entries > 0 && (
          <p className="mt-2 text-sm font-semibold tabular-nums">
            {outstanding.length === 0 ? (
              <span className="text-emerald-700 dark:text-emerald-400">All square</span>
            ) : (
              <span className="text-orange-700 dark:text-orange-400">
                {outstanding.map((t) => formatAmount(t.owed, t.currency)).join(' · ')} still owed
              </span>
            )}
          </p>
        )}
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${group.name}`}
        title={`Delete ${group.name}`}
        className="no-print absolute right-2 top-2 rounded-lg px-2 py-1 text-sm font-semibold leading-none text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-slate-500 dark:hover:bg-red-950 dark:hover:text-red-400"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * The card turns into its own confirmation rather than raising a dialog. A
 * delete on this page is irreversible for the copy on this device, and the
 * sentence that matters differs per group — whether anyone else still has it.
 */
function DeleteConfirm({ group, onConfirm, onCancel }: { group: StoredGroup; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className={`${card} h-full border-red-300 dark:border-red-900`}>
      <p className="text-sm text-slate-700 dark:text-slate-300">
        Delete <strong className="font-semibold">{group.name}</strong> from this device?
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {group.relayEnabled
          ? 'The synced copy and everyone else’s copies are untouched — re-open the join link to get it back.'
          : 'This copy is the only one, unless you have shared a link or saved the ledger file. It cannot be undone.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={btnDanger} onClick={onConfirm} autoFocus>
          Delete
        </button>
        <button type="button" className={btnGhost} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
