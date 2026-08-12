import { useEffect, useState } from 'react';
import { useFileDrop } from '@unisim/sdk';
import type { EffectiveLedger } from '../lib/events';
import type { StoredGroup } from '../lib/store';
import { encodeShareFragment, exportJson, linkSizeVerdict } from '../lib/codec';
import { ledgerCsv } from '../lib/csv';
import { capabilityFragment } from '../lib/relay';
import { useGroupStore } from '../stores/groupStore';
import UnisimQr from './UnisimQr';
import { btnDanger, btnGhost, btnPrimary, card } from './ui';

export default function ShareView({ group, ledger }: { group: StoredGroup; ledger: EffectiveLedger }) {
  const importFile = useGroupStore((s) => s.importFile);
  const compactBefore = useGroupStore((s) => s.compactBefore);
  const removeRecurring = useGroupStore((s) => s.removeRecurring);
  const enableRelay = useGroupStore((s) => s.enableRelay);
  const disableRelay = useGroupStore((s) => s.disableRelay);
  const syncNow = useGroupStore((s) => s.syncNow);
  const removeGroup = useGroupStore((s) => s.removeGroup);
  const sync = useGroupStore((s) => s.sync);

  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const importPicker = useFileDrop({
    onFiles: (files) => {
      const f = files[0];
      if (!f) return;
      setImportError(null);
      void f
        .text()
        .then((t) => importFile(t))
        .catch((err) => setImportError(err instanceof Error ? err.message : 'Could not read that file.'));
    },
    accept: 'application/json,.json',
    multiple: false,
    clickToBrowse: false,
  });

  useEffect(() => {
    let alive = true;
    void encodeShareFragment(group).then((frag) => {
      if (alive) setLink(`${location.origin}${import.meta.env.BASE_URL}#d=${frag}`);
    });
    return () => {
      alive = false;
    };
  }, [group]);

  const copy = async (text: string, which: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1800);
  };

  const download = (name: string, content: string, type: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const verdict = link ? linkSizeVerdict(link.length) : 'qr';
  const relayLink = group.relayKey
    ? `${location.origin}${import.meta.env.BASE_URL}#${capabilityFragment(group.groupId, group.relayKey)}&n=${encodeURIComponent(group.name)}`
    : null;

  const slug = group.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------ the share link */}
      <section className={card}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Share this group as a link</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          The whole ledger travels <em>inside</em> the link (in the part after #, which never reaches any server). Friends open it,
          and their copy merges with yours whenever you swap links again — re-opening an old link can never delete anything.
        </p>
        {link && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className={btnPrimary} onClick={() => void copy(link, 'link')}>
                {copied === 'link' ? 'Copied ✓' : 'Copy link'}
              </button>
              <SizeMeter chars={link.length} verdict={verdict} />
            </div>
            {verdict === 'qr' && (
              <div className="mt-3">
                <UnisimQr value={link} fileName={`${slug}-qr`} alt={`QR code holding the ${group.name} ledger — scan it to open this group`} />
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Point a friend's camera at this and the whole ledger travels across — no link to paste.
                </p>
              </div>
            )}
            {verdict === 'fragile' && (
              <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-400">
                Messaging apps rewrite or truncate links this long, silently, and a truncated link opens as nothing. Send the file
                below instead — or fold old history to shrink the link.
              </p>
            )}
          </>
        )}
      </section>

      {/* ------------------------------------------------ encrypted sync */}
      <section className={card}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sync between devices — end-to-end encrypted</h2>
        {!group.relayEnabled ? (
          <>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Turn this on and everyone's copies stay in step automatically. Your entries are encrypted <em>on this device</em>; the
              relay stores bytes it cannot read, and the key travels only inside the join link — we never see it. No account needed.
            </p>
            <button type="button" className={`${btnPrimary} mt-3`} onClick={() => void enableRelay()}>
              Turn on encrypted sync
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Anyone with the join link can read this group and add to it — <strong>the link is the key</strong>. Keep it in the
              group chat, not on a poster. If every copy of the link is lost, the synced copy is unrecoverable (we can't decrypt it);
              your local ledger stays on each device regardless.
            </p>
            {relayLink && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" className={btnPrimary} onClick={() => void copy(relayLink, 'relay')}>
                  {copied === 'relay' ? 'Copied ✓' : 'Copy join link'}
                </button>
                <button type="button" className={btnGhost} onClick={() => void syncNow()} disabled={sync.syncing}>
                  {sync.syncing ? 'Syncing…' : 'Sync now'}
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {sync.problem ? <span className="font-medium text-red-600 dark:text-red-400">{sync.problem}</span> : sync.lastSync ? `Last synced ${new Date(sync.lastSync).toLocaleTimeString()}` : null}
                </span>
              </div>
            )}
            {relayLink && (
              <div className="mt-3">
                <UnisimQr value={relayLink} fileName={`${slug}-join-qr`} alt={`QR code holding the join link for ${group.name}`} />
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Scanning this joins the group and hands over the key — same as sending the link, so treat it the same way. A copy
                  of this image is a copy of the key: don't leave it anywhere you wouldn't leave the link.
                </p>
              </div>
            )}
            <div className="mt-3">
              {!confirmDisable ? (
                <button type="button" className="text-xs font-medium text-slate-500 underline-offset-2 hover:underline dark:text-slate-400" onClick={() => setConfirmDisable(true)}>
                  Turn off sync…
                </button>
              ) : (
                <span className="flex flex-wrap gap-2 text-xs">
                  <button type="button" className={btnGhost} onClick={() => { void disableRelay(false); setConfirmDisable(false); }}>
                    Turn off on this device only
                  </button>
                  <button type="button" className={btnDanger} onClick={() => { void disableRelay(true); setConfirmDisable(false); }}>
                    Turn off and delete the synced copy for everyone
                  </button>
                  <button type="button" className="font-medium text-slate-500 hover:underline" onClick={() => setConfirmDisable(false)}>
                    Cancel
                  </button>
                </span>
              )}
            </div>
          </>
        )}
      </section>

      {/* ------------------------------------------------ file + exports */}
      <section className={card}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Files & exports</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={btnGhost} onClick={() => download(`${slug}-ledger.json`, exportJson(group), 'application/json')}>
            Download ledger file
          </button>
          <button type="button" className={btnGhost} onClick={importPicker.open}>
            Import a ledger file…
          </button>
          <button type="button" className={btnGhost} onClick={() => download(`${slug}.csv`, ledgerCsv(ledger), 'text/csv')}>
            Download CSV
          </button>
          <button type="button" className={btnGhost} onClick={() => window.print()}>
            Print view
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          The ledger file has no size ceiling and merges the same way links do. CSV is one row per entry with each person's share.
        </p>
        {importError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{importError}</p>}
        <input {...importPicker.inputProps} className="hidden" />
      </section>

      {/* ------------------------------------------------ housekeeping */}
      <section className={card}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Housekeeping</h2>
        {(group.recurring?.length ?? 0) > 0 && (
          <div className="mt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Monthly nudges (this device only)</h3>
            <ul className="mt-1.5 space-y-1 text-sm text-slate-700 dark:text-slate-300">
              {group.recurring!.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2">
                  <span>
                    {t.description} — day {t.dayOfMonth} each month
                  </span>
                  <button type="button" className="text-xs font-medium text-red-600/70 hover:text-red-600 hover:underline" onClick={() => void removeRecurring(t.id)}>
                    Stop
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Nudges live on this device and only ever ask — the expenses they add sync like any other. Set one up with the
              “repeat monthly” tick when adding an expense.
            </p>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={btnGhost}
            onClick={() => {
              const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
              void compactBefore(cutoff).then((n) =>
                useGroupStore.setState({
                  importNotice:
                    n === 0
                      ? 'Nothing older than 30 days to fold up.'
                      : `Folded ${n} old ${n === 1 ? 'entry' : 'entries'} into opening balances. Balances are unchanged; the link is smaller.`,
                }),
              );
            }}
          >
            Fold up history older than 30 days
          </button>
          {!confirmDelete ? (
            <button type="button" className={btnDanger} onClick={() => setConfirmDelete(true)}>
              Delete this group from this device…
            </button>
          ) : (
            <span className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-600 dark:text-slate-300">Other devices' copies are unaffected. Sure?</span>
              <button type="button" className={btnDanger} onClick={() => void removeGroup(group.groupId)}>
                Yes, delete it here
              </button>
              <button type="button" className="font-medium text-slate-500 hover:underline" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

function SizeMeter({ chars, verdict }: { chars: number; verdict: 'qr' | 'safe' | 'fragile' }) {
  const styles = {
    qr: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
    safe: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
    fragile: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  } as const;
  const text = {
    qr: `${chars.toLocaleString()} characters — fits a QR code`,
    safe: `${chars.toLocaleString()} characters — fine for messaging apps, too big for a reliable QR`,
    fragile: `${chars.toLocaleString()} characters — too long to trust to a messaging app`,
  } as const;
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles[verdict]}`}>{text[verdict]}</span>;
}
