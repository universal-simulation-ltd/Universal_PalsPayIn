import { useState } from 'react';
import type { BankAccount, EventId, MemberEvent, MemberHandles, PayMethod } from '../lib/events';
import { PAY_METHODS, bankAccountFilled, offersMethod } from '../lib/events';
import { cleanHandle } from '../lib/paylinks';
import { useGroupStore } from '../stores/groupStore';
import { btnGhost, btnPrimary, card, checkboxCls, inputCls, label, MemberDot } from './ui';

const METHOD_LABEL: Record<PayMethod, string> = {
  cash: 'Cash',
  bank: 'Bank transfer',
  paypal: 'PayPal',
  monzo: 'Monzo',
  revolut: 'Revolut',
};

type Ticks = Record<PayMethod, boolean>;

const ticksFor = (handles: MemberHandles | undefined): Ticks =>
  Object.fromEntries(PAY_METHODS.map((m) => [m, offersMethod(handles, m)])) as Ticks;

export default function MembersEditor({ members }: { members: MemberEvent[] }) {
  const addMember = useGroupStore((s) => s.addMember);
  const amendMember = useGroupStore((s) => s.amendMember);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<EventId | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draft, setDraft] = useState<MemberHandles>({});
  const [account, setAccount] = useState<BankAccount>({});
  const [ticks, setTicks] = useState<Ticks>(ticksFor(undefined));

  const startEdit = (m: MemberEvent) => {
    setEditing(m.id);
    setDraftName(m.name);
    setDraft({ ...m.handles });
    setAccount({ ...m.handles?.bankAccount });
    setTicks(ticksFor(m.handles));
  };

  const save = (m: MemberEvent) => {
    // Only ticked methods are stored. Un-ticking is how you withdraw an offer,
    // so it has to actually drop the details rather than leave them lying in
    // the ledger where the settle-up message would still find them.
    const handles: MemberHandles = {};
    if (ticks.cash) handles.cash = true;
    for (const k of ['paypal', 'monzo', 'revolut'] as const) {
      const cleaned = ticks[k] && draft[k] ? cleanHandle(draft[k]) : '';
      if (cleaned) handles[k] = cleaned;
    }
    if (ticks.bank) {
      const trimmed: BankAccount = Object.fromEntries(
        (Object.entries(account) as [keyof BankAccount, string | undefined][])
          .map(([k, v]) => [k, v?.trim()])
          .filter(([, v]) => v),
      );
      if (bankAccountFilled(trimmed)) handles.bankAccount = trimmed;
      if (draft.bank?.trim()) handles.bank = draft.bank.trim();
    }
    void amendMember(m.id, {
      name: draftName.trim() || m.name,
      colour: m.colour,
      ...(Object.keys(handles).length ? { handles } : {}),
    });
    setEditing(null);
  };

  return (
    <section className={`${card} no-print`}>
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">People</h2>
      <ul className="space-y-1.5">
        {members.map((m) => (
          <li key={m.id} className="text-sm text-slate-700 dark:text-slate-300">
            {editing === m.id ? (
              <div className="space-y-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                <div>
                  <label className={label}>Name</label>
                  <input className={`${inputCls} max-w-60`} value={draftName} onChange={(e) => setDraftName(e.target.value)} autoFocus />
                </div>

                <div>
                  <label className={label}>How can people pay {draftName || m.name}?</label>
                  <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                    Theirs to offer, stored in this group's ledger like any other detail. Whoever owes them gets the choice at
                    settle-up time. Only PayPal links can carry the amount; the app still never moves money or learns whether a
                    payment happened.
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {PAY_METHODS.map((method) => (
                      <label key={method} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className={checkboxCls}
                          checked={ticks[method]}
                          onChange={(e) => setTicks((t) => ({ ...t, [method]: e.target.checked }))}
                        />
                        {METHOD_LABEL[method]}
                      </label>
                    ))}
                  </div>
                </div>

                {ticks.bank && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="min-w-0">
                      <label className={label}>Account name</label>
                      <input className={inputCls} placeholder="J Smith" value={account.name ?? ''} onChange={(e) => setAccount((a) => ({ ...a, name: e.target.value }))} />
                    </div>
                    <div className="min-w-0">
                      <label className={label}>Sort code</label>
                      <input className={`${inputCls} tabular`} inputMode="numeric" placeholder="00-00-00" value={account.sortCode ?? ''} onChange={(e) => setAccount((a) => ({ ...a, sortCode: e.target.value }))} />
                    </div>
                    <div className="min-w-0">
                      <label className={label}>Account number</label>
                      <input className={`${inputCls} tabular`} inputMode="numeric" placeholder="12345678" value={account.number ?? ''} onChange={(e) => setAccount((a) => ({ ...a, number: e.target.value }))} />
                    </div>
                    <div className="min-w-0">
                      <label className={label}>Reference to use</label>
                      <input className={inputCls} placeholder="Weekend away" value={account.reference ?? ''} onChange={(e) => setAccount((a) => ({ ...a, reference: e.target.value }))} />
                    </div>
                    <div className="min-w-0 sm:col-span-2">
                      <label className={label}>Anything else (IBAN, building society roll number…)</label>
                      <input className={inputCls} value={draft.bank ?? ''} onChange={(e) => setDraft((d) => ({ ...d, bank: e.target.value }))} />
                    </div>
                  </div>
                )}

                {(['paypal', 'monzo', 'revolut'] as const).filter((k) => ticks[k]).length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {ticks.paypal && (
                      <div className="min-w-0">
                        <label className={label}>PayPal.me username</label>
                        <input className={inputCls} placeholder="paypal.me/…" value={draft.paypal ?? ''} onChange={(e) => setDraft((d) => ({ ...d, paypal: e.target.value }))} />
                      </div>
                    )}
                    {ticks.monzo && (
                      <div className="min-w-0">
                        <label className={label}>Monzo.me username</label>
                        <input className={inputCls} placeholder="monzo.me/…" value={draft.monzo ?? ''} onChange={(e) => setDraft((d) => ({ ...d, monzo: e.target.value }))} />
                      </div>
                    )}
                    {ticks.revolut && (
                      <div className="min-w-0">
                        <label className={label}>Revolut Revtag</label>
                        <input className={inputCls} placeholder="revolut.me/…" value={draft.revolut ?? ''} onChange={(e) => setDraft((d) => ({ ...d, revolut: e.target.value }))} />
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button type="button" className={btnPrimary} onClick={() => save(m)}>
                    Save
                  </button>
                  <button type="button" className={btnGhost} onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <MemberDot colour={m.colour} name={m.name} />
                {PAY_METHODS.some((k) => offersMethod(m.handles, k)) && (
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    {PAY_METHODS.filter((k) => offersMethod(m.handles, k)).map((k) => METHOD_LABEL[k]).join(' · ')}
                  </span>
                )}
                <button
                  type="button"
                  className="text-xs font-medium text-slate-400 hover:text-slate-600 hover:underline dark:hover:text-slate-300"
                  onClick={() => startEdit(m)}
                >
                  edit
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex max-w-sm gap-2">
        <input className={inputCls} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add someone…" />
        <button
          type="button"
          className={`${newName.trim() ? btnPrimary : btnGhost} shrink-0`}
          disabled={newName.trim() === ''}
          onClick={() => {
            void addMember(newName);
            setNewName('');
          }}
        >
          Add
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        People are just names in this group — no accounts, no emails, no invitations. Nobody can be removed once they're in
        expenses; rename them instead.
      </p>
    </section>
  );
}
