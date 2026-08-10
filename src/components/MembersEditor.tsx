import { useState } from 'react';
import type { EventId, MemberEvent } from '../lib/events';
import { useGroupStore } from '../stores/groupStore';
import { btnGhost, btnPrimary, card, inputCls, MemberDot } from './ui';

export default function MembersEditor({ members }: { members: MemberEvent[] }) {
  const addMember = useGroupStore((s) => s.addMember);
  const amendMember = useGroupStore((s) => s.amendMember);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<EventId | null>(null);
  const [renameTo, setRenameTo] = useState('');

  return (
    <section className={`${card} no-print`}>
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">People</h2>
      <ul className="space-y-1.5">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            {renaming === m.id ? (
              <>
                <input className={`${inputCls} max-w-48`} value={renameTo} onChange={(e) => setRenameTo(e.target.value)} autoFocus />
                <button
                  type="button"
                  className="text-xs font-semibold text-orange-700 hover:underline dark:text-orange-400"
                  disabled={renameTo.trim() === ''}
                  onClick={() => {
                    void amendMember(m.id, { name: renameTo.trim(), colour: m.colour, ...(m.handle ? { handle: m.handle } : {}) });
                    setRenaming(null);
                  }}
                >
                  Save
                </button>
                <button type="button" className="text-xs font-medium text-slate-500 hover:underline" onClick={() => setRenaming(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <MemberDot colour={m.colour} name={m.name} />
                <button
                  type="button"
                  className="text-xs font-medium text-slate-400 hover:text-slate-600 hover:underline dark:hover:text-slate-300"
                  onClick={() => {
                    setRenaming(m.id);
                    setRenameTo(m.name);
                  }}
                >
                  rename
                </button>
              </>
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
