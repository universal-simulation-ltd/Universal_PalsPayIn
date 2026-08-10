import { useRef, useState } from 'react';
import { useGroupStore } from '../stores/groupStore';
import { effectiveLedger } from '../lib/events';
import { btnGhost, btnPrimary, card, inputCls, label } from './ui';

export default function GroupList() {
  const groups = useGroupStore((s) => s.groups);
  const open = useGroupStore((s) => s.open);
  const createGroup = useGroupStore((s) => s.createGroup);
  const importFile = useGroupStore((s) => s.importFile);

  const [name, setName] = useState('');
  const [members, setMembers] = useState('');
  const [creating, setCreating] = useState(groups.length === 0);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Split bills with friends</h1>
        <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Log who paid for what, split it evenly, exactly, by shares or item by item, and settle up in the fewest transfers.
          Everything stays in this browser unless you share it. No account, no ads — and the app <strong>never moves money</strong>.
        </p>
      </header>

      {groups.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => {
            const eff = effectiveLedger(g.events);
            return (
              <li key={g.groupId}>
                <button type="button" onClick={() => open(g.groupId)} className={`${card} w-full text-left transition hover:border-orange-300 dark:hover:border-orange-800`}>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{g.name}</h2>
                    {g.relayEnabled && (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                        encrypted sync on
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {eff.members.length} people · {eff.entries.length} entries
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <section className={card}>
        {!creating ? (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>
              New group
            </button>
            <button type="button" className={btnGhost} onClick={() => fileInput.current?.click()}>
              Import a ledger file…
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
            <div className="flex gap-2">
              <button type="button" className={btnPrimary} disabled={!canCreate} onClick={() => void onCreate()}>
                Create group
              </button>
              {groups.length > 0 && (
                <button type="button" className={btnGhost} onClick={() => setCreating(false)}>
                  Cancel
                </button>
              )}
              <button type="button" className={btnGhost} onClick={() => fileInput.current?.click()}>
                Import a ledger file…
              </button>
            </div>
          </div>
        )}
        {importError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{importError}</p>}
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ''; // same file re-picked must fire again
            if (f) void onFile(f);
          }}
        />
      </section>
    </div>
  );
}
