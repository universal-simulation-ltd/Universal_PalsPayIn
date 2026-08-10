import { useState } from 'react';
import type { EventId, MemberEvent, MemberHandles } from '../lib/events';
import { cleanHandle } from '../lib/paylinks';
import { useGroupStore } from '../stores/groupStore';
import { btnGhost, btnPrimary, card, inputCls, label, MemberDot } from './ui';

export default function MembersEditor({ members }: { members: MemberEvent[] }) {
  const addMember = useGroupStore((s) => s.addMember);
  const amendMember = useGroupStore((s) => s.amendMember);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<EventId | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draft, setDraft] = useState<MemberHandles>({});

  const startEdit = (m: MemberEvent) => {
    setEditing(m.id);
    setDraftName(m.name);
    setDraft({ ...m.handles });
  };

  const save = (m: MemberEvent) => {
    const handles: MemberHandles = {};
    if (draft.paypal && cleanHandle(draft.paypal)) handles.paypal = cleanHandle(draft.paypal);
    if (draft.monzo && cleanHandle(draft.monzo)) handles.monzo = cleanHandle(draft.monzo);
    if (draft.revolut && cleanHandle(draft.revolut)) handles.revolut = cleanHandle(draft.revolut);
    if (draft.bank?.trim()) handles.bank = draft.bank.trim();
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
              <div className="space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                <div>
                  <label className={label}>Name</label>
                  <input className={`${inputCls} max-w-60`} value={draftName} onChange={(e) => setDraftName(e.target.value)} autoFocus />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Optional ways to pay {draftName || m.name} — theirs to share, stored in this group's ledger like any other detail.
                  Settling up will offer these to whoever owes them. Only PayPal links can carry the amount; the app still never
                  moves money or learns whether a payment happened.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className={label}>PayPal.me username</label>
                    <input className={inputCls} placeholder="paypal.me/…" value={draft.paypal ?? ''} onChange={(e) => setDraft((d) => ({ ...d, paypal: e.target.value }))} />
                  </div>
                  <div>
                    <label className={label}>Monzo.me username</label>
                    <input className={inputCls} placeholder="monzo.me/…" value={draft.monzo ?? ''} onChange={(e) => setDraft((d) => ({ ...d, monzo: e.target.value }))} />
                  </div>
                  <div>
                    <label className={label}>Revolut Revtag</label>
                    <input className={inputCls} placeholder="revolut.me/…" value={draft.revolut ?? ''} onChange={(e) => setDraft((d) => ({ ...d, revolut: e.target.value }))} />
                  </div>
                  <div>
                    <label className={label}>Bank details (free text)</label>
                    <input className={inputCls} placeholder="Sort 00-00-00, acct 12345678, ref rent" value={draft.bank ?? ''} onChange={(e) => setDraft((d) => ({ ...d, bank: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className={btnPrimary} onClick={() => save(m)}>
                    Save
                  </button>
                  <button type="button" className={btnGhost} onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <span className="flex items-center gap-2">
                <MemberDot colour={m.colour} name={m.name} />
                {m.handles && Object.keys(m.handles).length > 0 && (
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    {[m.handles.paypal && 'PayPal', m.handles.monzo && 'Monzo', m.handles.revolut && 'Revolut', m.handles.bank && 'bank'].filter(Boolean).join(' · ')}
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
          className={newName.trim() ? btnPrimary : btnGhost}
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
