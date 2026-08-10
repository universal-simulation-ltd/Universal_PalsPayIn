import { useEffect, useRef, useState } from 'react';
import type { EffectiveLedger, EventId, ExpenseEvent, PaymentEvent } from '../lib/events';
import { deletePhoto, downscalePhoto, loadPhoto, savePhoto, type StoredGroup } from '../lib/store';
import { formatAmount } from '../lib/money';
import { computeShares } from '../lib/split';
import { useGroupStore } from '../stores/groupStore';
import ExpenseForm from './ExpenseForm';
import PaymentForm from './PaymentForm';
import { card, MemberDot } from './ui';

export default function EntryList({ group, ledger }: { group: StoredGroup; ledger: EffectiveLedger }) {
  const voidEntry = useGroupStore((s) => s.voidEntry);
  const [editingId, setEditingId] = useState<EventId | null>(null);
  const [expandedId, setExpandedId] = useState<EventId | null>(null);
  const [confirmVoid, setConfirmVoid] = useState<EventId | null>(null);

  const nameOf = (id: EventId) => ledger.members.find((m) => m.id === id)?.name ?? 'someone';
  const memberOf = (id: EventId) => ledger.members.find((m) => m.id === id);
  const entries = [...ledger.entries].reverse(); // newest first

  if (entries.length === 0 && ledger.opening.length === 0) {
    return (
      <section className={card}>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Nothing here yet. Add the first expense — the taxi, the shopping, the thing somebody definitely paid for.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((e) => {
        const editing = editingId === e.id;
        const conflict = ledger.conflicted.get(e.id);
        if (editing && e.kind === 'expense') {
          return <ExpenseForm key={e.id} members={ledger.members} editing={e as ExpenseEvent} onClose={() => setEditingId(null)} />;
        }
        if (editing && e.kind === 'payment') {
          return <PaymentForm key={e.id} members={ledger.members} editing={e as PaymentEvent} onClose={() => setEditingId(null)} />;
        }
        return (
          <article key={e.id} className={`${card} !p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {e.kind === 'expense' ? (
                  <>
                    <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{e.description}</h3>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {e.date} · paid by <MemberDot colour={memberOf(e.payer)?.colour ?? '#999'} name={nameOf(e.payer)} />
                      {e.category ? ` · ${e.category}` : ''} · {splitLabel(e)}
                      {e.charged ? ` · card charged ${formatAmount(e.charged.minor, e.charged.currency)}` : ''}
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {nameOf(e.from)} marked {formatAmount(e.minor, e.currency)} as sent to {nameOf(e.to)}
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {e.date}
                      {e.note ? ` · ${e.note}` : ''} · recorded, not verified — the app can't see bank accounts
                    </p>
                  </>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="tabular text-sm font-semibold text-slate-900 dark:text-slate-100">{formatAmount(e.minor, e.currency)}</span>
              </div>
            </div>

            {conflict && (
              <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                ✎ Edited on two devices at once — showing the later edit.{' '}
                <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
                  {expandedId === e.id ? 'Hide' : 'Show'} the other version
                </button>
                {expandedId === e.id && (
                  <ul className="mt-1 list-disc pl-4">
                    {conflict.slice(0, -1).map((a) => (
                      <li key={a.id}>
                        {'description' in a.body ? `"${(a.body as { description?: string }).description}"` : 'edit'}
                        {'minor' in a.body ? ` — ${formatAmount((a.body as { minor: number }).minor, (a.body as { currency?: string }).currency ?? e.currency)}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="no-print mt-2 flex gap-3 text-xs">
              {e.kind === 'expense' && (
                <button type="button" className="font-medium text-slate-500 hover:underline dark:text-slate-400" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
                  {expandedId === e.id ? 'Hide shares' : 'Who owes what?'}
                </button>
              )}
              <button type="button" className="font-medium text-slate-500 hover:underline dark:text-slate-400" onClick={() => setEditingId(e.id)}>
                Edit
              </button>
              {confirmVoid === e.id ? (
                <span className="inline-flex gap-2">
                  <span className="text-slate-500">Remove? It stays in the history as removed.</span>
                  <button
                    type="button"
                    className="font-semibold text-red-600 hover:underline"
                    onClick={() => {
                      void voidEntry(e.id);
                      setConfirmVoid(null);
                    }}
                  >
                    Yes, remove
                  </button>
                  <button type="button" className="font-medium text-slate-500 hover:underline" onClick={() => setConfirmVoid(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button type="button" className="font-medium text-red-600/70 hover:text-red-600 hover:underline" onClick={() => setConfirmVoid(e.id)}>
                  Remove
                </button>
              )}
            </div>

            {expandedId === e.id && e.kind === 'expense' && !conflict && (
              <ul className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2 dark:text-slate-300">
                {[...computeShares(e as ExpenseEvent)].map(([member, share]) => (
                  <li key={member} className="flex justify-between gap-2 rounded bg-slate-50 px-2 py-1 dark:bg-slate-800/60">
                    <MemberDot colour={memberOf(member)?.colour ?? '#999'} name={nameOf(member)} />
                    <span className="tabular">{formatAmount(share, e.currency)}</span>
                  </li>
                ))}
              </ul>
            )}

            {expandedId === e.id && e.kind === 'expense' && <ReceiptPhoto groupId={group.groupId} entryId={e.id} />}
          </article>
        );
      })}

      {ledger.opening.length > 0 && (
        <article className={`${card} !p-4`}>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Opening balances</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Older history was folded up to keep the share link small. These carry its net effect exactly.
          </p>
          <ul className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2 dark:text-slate-300">
            {ledger.opening.map((o, i) => (
              <li key={i} className="flex justify-between gap-2 rounded bg-slate-50 px-2 py-1 dark:bg-slate-800/60">
                <MemberDot colour={memberOf(o.member)?.colour ?? '#999'} name={nameOf(o.member)} />
                <span className="tabular">{formatAmount(o.minor, o.currency, { sign: true })}</span>
              </li>
            ))}
          </ul>
        </article>
      )}
      <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
        {group.events.length} events in the log — nothing is ever deleted, removals are recorded too.
      </p>
    </div>
  );
}

/**
 * A locally-attached receipt photo. IndexedDB only, downscaled, and NEVER
 * part of the event log — so it cannot reach share links, ledger files,
 * CSVs or the encrypted relay. The photo of your dinner stays on the device
 * that took it, and the UI says exactly that.
 */
function ReceiptPhoto({ groupId, entryId }: { groupId: string; entryId: EventId }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    void loadPhoto(groupId, entryId).then((blob) => {
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      }
      setLoaded(true);
    });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [groupId, entryId]);

  if (!loaded) return null;

  return (
    <div className="no-print mt-2 text-xs">
      {url ? (
        <div className="flex items-start gap-3">
          <a href={url} target="_blank" rel="noreferrer">
            <img src={url} alt="Receipt" className="max-h-28 rounded-lg border border-slate-200 dark:border-slate-700" />
          </a>
          <button
            type="button"
            className="font-medium text-red-600/70 hover:text-red-600 hover:underline"
            onClick={() => {
              void deletePhoto(groupId, entryId);
              setUrl(null);
            }}
          >
            Remove photo
          </button>
        </div>
      ) : (
        <button type="button" className="font-medium text-slate-500 hover:underline dark:text-slate-400" onClick={() => input.current?.click()}>
          📎 Attach a receipt photo — stays on this device only, never in links, files or sync
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          void downscalePhoto(f)
            .then((blob) => savePhoto(groupId, entryId, blob).then(() => setUrl(URL.createObjectURL(blob))));
        }}
      />
    </div>
  );
}

function splitLabel(e: ExpenseEvent): string {
  switch (e.split.mode) {
    case 'even':
      return `split evenly between ${e.split.participants.length}`;
    case 'exact':
      return 'exact amounts';
    case 'shares':
      return e.split.shares.reduce((a, s) => a + s.weight, 0) === 10_000 ? 'by percentage' : 'by shares';
    case 'itemised':
      return `itemised, ${e.split.items.length} ${e.split.items.length === 1 ? 'line' : 'lines'}`;
  }
}
