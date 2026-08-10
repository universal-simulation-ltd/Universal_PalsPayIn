// Compaction — the ONLY way the log (and therefore the share link) shrinks.
// A `compact` event replaces a set of entries with opening balances. It must
// name every id it subsumes, or a device holding the old log re-unions them
// and double-counts; and tombstones must never be garbage-collected ahead of
// a compact, or a friend opening a two-month-old link resurrects a deleted
// expense and nobody can work out why.
//
// Compaction buys roughly 2.5–3× of link headroom, once. It moves the wall;
// it does not remove it — the relay (Phase 2) is what removes it.

import {
  effectiveLedger, eventTimestamp, randomEventId,
  type CompactEvent, type EventId, type LedgerEvent,
} from './events';
import { balances } from './balances';

/**
 * Build a compact retiring every entry dated before `cutoffDate`
 * (yyyy-mm-dd). Returns null if there is nothing to retire. Never touches
 * member events — names must survive.
 */
export function buildCompact(events: LedgerEvent[], cutoffDate: string, author: string): CompactEvent | null {
  const eff = effectiveLedger(events);
  const retiring = eff.entries.filter((e) => e.date < cutoffDate);
  if (retiring.length === 0) return null;

  // The new compact absorbs the previously applied compacts too (their ids go
  // in `subsumes`, their openings into the new opening) — so there is only
  // ever one live opening-balance baseline.
  const appliedPriorIds = events
    .filter((e): e is CompactEvent => e.kind === 'compact')
    .filter((c) => !eff.skippedCompacts.includes(c) && !eff.subsumed.has(c.id))
    .map((c) => c.id);

  // Opening balances = balances of (retired entries, resolved) + prior openings.
  const bal = balances({ ...eff, entries: retiring, opening: eff.opening });

  const opening: CompactEvent['opening'] = [];
  for (const [currency, nets] of bal.nets) {
    for (const [member, minor] of nets) {
      if (minor !== 0) opening.push({ member, currency, minor });
    }
  }

  return {
    kind: 'compact',
    id: randomEventId(),
    author,
    at: eventTimestamp(),
    subsumes: [...retiring.map((e) => e.id), ...appliedPriorIds],
    opening,
  };
}

/**
 * Physically drop events retired by applied compacts: the subsumed entries,
 * their amend/void chains, and compacts that were themselves re-compacted.
 * Safe AFTER the compact exists in the log — union with any stale copy still
 * converges, because the compact names what it replaced.
 */
export function pruneCompacted(events: LedgerEvent[]): LedgerEvent[] {
  const eff = effectiveLedger(events);
  if (eff.subsumed.size === 0) return events;
  const dropped = new Set<EventId>(eff.subsumed);
  return events.filter((e) => {
    if (dropped.has(e.id)) return false;
    if ((e.kind === 'amend' || e.kind === 'void') && dropped.has(e.supersedes)) return false;
    return true;
  });
}
