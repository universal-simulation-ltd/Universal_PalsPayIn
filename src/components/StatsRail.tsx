// The summary rail — the narrow right-hand column beside the group list and
// beside an open group.
//
// It is a READ of the ledger and nothing else: no control here changes money,
// and the only button jumps to a tab. The wording follows the same rule as the
// rest of the app — it says what is owed BETWEEN people, never what is held,
// because nothing is ever held.

import type { ReactNode } from 'react';
import { formatAmount } from '../lib/money';
import type { CurrencyTotal, GroupStats, PortfolioStats } from '../lib/stats';
import { card } from './ui';

/** yyyy-mm-dd → "1 Aug 2026", parsed as calendar parts so a timezone west of
 *  UTC cannot roll the date back a day. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function RailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={card}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Figure({ label, value, tone = 'text-slate-900 dark:text-slate-100' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</dt>
      {/* tabular-nums so a column of figures lines up on the decimal point. */}
      <dd className={`truncate text-lg font-bold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}

const OWED_TONE = 'text-orange-700 dark:text-orange-400';
const SQUARE_TONE = 'text-emerald-700 dark:text-emerald-400';

/**
 * One currency's block. Currencies are never netted together — a group that
 * spent £400 and €90 has two blocks, because asserting one number would mean
 * asserting an exchange rate nobody gave us.
 */
function CurrencyBlock({ total, perPerson }: { total: CurrencyTotal; perPerson?: number }) {
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-2 gap-3">
        <Figure label="Total spent" value={formatAmount(total.spent, total.currency)} />
        <Figure
          label={total.owed === 0 ? 'Outstanding' : 'Still owed'}
          value={total.owed === 0 ? 'All square' : formatAmount(total.owed, total.currency)}
          tone={total.owed === 0 ? SQUARE_TONE : OWED_TONE}
        />
      </dl>
      {perPerson !== undefined && perPerson > 0 && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          ≈ {formatAmount(perPerson, total.currency)} each, spread evenly
        </p>
      )}
    </div>
  );
}

function CurrencySections({ totals, members }: { totals: CurrencyTotal[]; members?: number }) {
  return (
    <div className="space-y-4">
      {totals.map((t, i) => (
        <div key={t.currency} className={i > 0 ? 'border-t border-slate-200 pt-4 dark:border-slate-800' : ''}>
          {totals.length > 1 && (
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t.currency}</p>
          )}
          <CurrencyBlock total={t} perPerson={members && members > 0 ? Math.round(t.spent / members) : undefined} />
        </div>
      ))}
    </div>
  );
}

/** The standing disclaimer, in the one place a column of money figures could
 *  be misread as a balance somebody is holding. */
function NeverHolds() {
  return (
    <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
      What people owe <em>each other</em>. This app keeps the record — it never holds or moves money.
    </p>
  );
}

function FoldedNote() {
  return (
    <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
      Folded-up history isn't counted in the spend — the balances still are.
    </p>
  );
}

// ---------------------------------------------------------------- group list

export function PortfolioRail({ stats }: { stats: PortfolioStats }) {
  return (
    <>
      <RailCard title="Across every group">
        <dl className="grid grid-cols-2 gap-3">
          <Figure label="Groups" value={String(stats.groups)} />
          <Figure
            label="Still to settle"
            value={stats.open === 0 ? 'None' : `${stats.open} of ${stats.groups}`}
            tone={stats.open === 0 ? SQUARE_TONE : OWED_TONE}
          />
          <Figure label="Expenses" value={String(stats.expenses)} />
          <Figure label="Payments" value={String(stats.payments)} />
        </dl>
      </RailCard>

      {stats.totals.length > 0 && (
        <RailCard title="The money">
          <CurrencySections totals={stats.totals} />
          <div className="mt-4 space-y-1.5">
            <NeverHolds />
            {stats.folded && <FoldedNote />}
          </div>
        </RailCard>
      )}
    </>
  );
}

// --------------------------------------------------------------- one group

export function GroupRail({
  stats,
  transfers,
  onSettle,
}: {
  stats: GroupStats;
  /** Transfers in the settle-up plan currently on offer, across all currencies. */
  transfers: number;
  onSettle: () => void;
}) {
  const entries = stats.expenses + stats.payments;
  return (
    <>
      <RailCard title="At a glance">
        {/* Expenses and payments, not a combined "entries" — the total is the
            sum of the two figures next to it, and a rail should not spend a
            slot on arithmetic the reader can do. */}
        <dl className="grid grid-cols-2 gap-3">
          <Figure label="People" value={String(stats.members)} />
          <Figure label="Expenses" value={String(stats.expenses)} />
          <Figure label="Payments" value={String(stats.payments)} />
        </dl>
        {stats.first && stats.last && (
          <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
            {stats.first === stats.last ? shortDate(stats.first) : `${shortDate(stats.first)} → ${shortDate(stats.last)}`}
          </p>
        )}
      </RailCard>

      {stats.totals.length > 0 ? (
        <RailCard title="The money">
          <CurrencySections totals={stats.totals} members={stats.members} />
          <div className="mt-4 space-y-1.5">
            <NeverHolds />
            {stats.folded && <FoldedNote />}
          </div>
        </RailCard>
      ) : (
        <RailCard title="The money">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Nothing logged yet. Add an expense and the totals appear here.
          </p>
        </RailCard>
      )}

      {entries > 0 && (
        <RailCard title="Settle up">
          {transfers === 0 ? (
            <p className={`text-lg font-bold ${SQUARE_TONE}`}>All square</p>
          ) : (
            <>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                <strong className="font-semibold">
                  {transfers} {transfers === 1 ? 'transfer' : 'transfers'}
                </strong>{' '}
                {transfers === 1 ? 'clears' : 'clear'} everything.
              </p>
              <button
                type="button"
                onClick={onSettle}
                className="no-print mt-2 text-sm font-semibold text-orange-700 underline-offset-2 hover:underline dark:text-orange-400"
              >
                See who pays whom →
              </button>
            </>
          )}
        </RailCard>
      )}
    </>
  );
}
