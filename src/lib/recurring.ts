// Recurring expenses — monthly templates that NUDGE, never auto-add.
//
// Deliberately NOT in the event log: a 7th event kind would change the codec
// and the §18.2 model for what is metadata, not money. Templates live on the
// device that created them (StoredGroup.recurring); the expenses they
// materialise are ordinary expense events and sync like any other. If two
// housemates both hold a template and both add the rent, that is exactly the
// same-payer/same-amount/same-week case the duplicate-suspicion prompt
// already exists for — the safety net is structural, not bolted on.
//
// Monthly only, day 1–28, on purpose: rent and utilities are monthly, and
// day 29–31 clamping rules are a bug farm nobody's rent needs.

import type { EventId, SplitSpec } from './events';

export interface RecurringTemplate {
  id: string;
  description: string;
  minor: number;
  currency: string;
  payer: EventId;
  split: SplitSpec;
  dayOfMonth: number; // 1..28
  /** ISO date of the template's creation — occurrences start after this. */
  createdOn: string;
  /** ISO date of the last occurrence materialised (the due date itself). */
  lastAdded?: string;
}

/**
 * The most recent occurrence date on or before `todayIso` that has not been
 * added yet, or null if none is due. Skipped months stay skipped — the nudge
 * is for THIS month's rent, not an invoice backlog.
 */
export function dueOccurrence(t: RecurringTemplate, todayIso: string): string | null {
  const today = new Date(todayIso + 'T00:00:00Z');
  const day = Math.min(Math.max(1, t.dayOfMonth), 28);
  let occ = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), day));
  if (occ.getTime() > today.getTime()) occ = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, day));
  const occIso = occ.toISOString().slice(0, 10);
  if (occIso <= t.createdOn) return null; // first occurrence is after creation
  if (t.lastAdded && occIso <= t.lastAdded) return null;
  return occIso;
}
