// The state is an append-only set of immutable events with random ids, and the
// merge rule is set union. Nothing is mutated in place; nothing is deleted.
// Union is commutative, associative and idempotent (a G-Set), so two logs
// merged in any order, any number of times, converge — no vector clocks, no
// server arbitration.
//
// Timestamps (`at`) are for DISPLAY ORDER and for tie-breaking concurrent
// amends, and for nothing else. A balance is a sum over a set and addition
// commutes, so clock skew cannot corrupt money. Do not reach for
// `updated_at` last-write-wins here — it is right for single-author apps and
// wrong for this one.

export type EventId = string; // 12 hex chars — 48-bit random

export interface BaseEvent {
  id: EventId;
  author: string; // device id, not a person — used only for deterministic tie-breaks
  at: number; // ms epoch when authored; display + tie-break only
}

export interface MemberEvent extends BaseEvent {
  kind: 'member';
  name: string;
  colour: string;
  /** Optional payment handle the member chose to share (e.g. a paypal.me name). Theirs, stored locally, never ours. */
  handle?: string;
}

export type SplitSpec =
  | { mode: 'even'; participants: EventId[] }
  | { mode: 'exact'; amounts: { member: EventId; minor: number }[] }
  | { mode: 'shares'; shares: { member: EventId; weight: number }[] }
  | {
      mode: 'itemised';
      items: { label: string; minor: number; assignees: EventId[] }[];
      adjustments: {
        kind: 'tax' | 'tip' | 'service' | 'discount';
        minor: number; // negative for discounts
        alloc: 'prorata' | 'even' | { member: EventId };
      }[];
    };

export interface ExpenseEvent extends BaseEvent {
  kind: 'expense';
  payer: EventId; // member event id
  minor: number;
  currency: string;
  date: string; // ISO yyyy-mm-dd — the day it happened, not when it was typed
  description: string;
  category?: string; // one free-text field; deliberately not a taxonomy
  split: SplitSpec;
  /** For a bill paid in another currency: what the payer's own money actually was. */
  charged?: { currency: string; minor: number };
}

export interface PaymentEvent extends BaseEvent {
  kind: 'payment';
  // "Alex says they sent Sam £15." A claim by a user, never a confirmation.
  from: EventId;
  to: EventId;
  minor: number;
  currency: string;
  date: string;
  note?: string;
  /** If settled in a different currency, the user-supplied conversion for the ledger. */
  charged?: { currency: string; minor: number };
}

export interface AmendEvent extends BaseEvent {
  kind: 'amend';
  supersedes: EventId; // always the ORIGINAL event's id, even for a re-edit
  body: Omit<MemberEvent, keyof BaseEvent | 'kind'> | Omit<ExpenseEvent, keyof BaseEvent | 'kind'> | Omit<PaymentEvent, keyof BaseEvent | 'kind'>;
}

export interface VoidEvent extends BaseEvent {
  kind: 'void';
  supersedes: EventId; // a tombstone — deletion is never a removal
}

export interface CompactEvent extends BaseEvent {
  kind: 'compact';
  subsumes: EventId[]; // must name every id it replaces, or a device holding the old log double-counts
  // Member events are never subsumed — they are tiny and the names must survive.
  opening: { member: EventId; currency: string; minor: number }[]; // sums to zero per currency
}

export type LedgerEvent = MemberEvent | ExpenseEvent | PaymentEvent | AmendEvent | VoidEvent | CompactEvent;

export interface Group {
  groupId: string; // 128-bit hex — local identity; also the relay id when sync is on
  name: string;
  events: LedgerEvent[];
  /** Phase 2: base64url 256-bit AES key. Lives here and in the capability link; never sent to the relay. */
  relayKey?: string;
  relayEnabled?: boolean;
}

// ---------------------------------------------------------------------------

/**
 * Event timestamps are SECOND-precision, deliberately: the share-link codec
 * stores seconds, and if a device that authored an event (ms clock) and a
 * device that received it via link (s clock) held different `at` values, an
 * amend tie-break could resolve differently on the two devices.
 */
export function eventTimestamp(): number {
  return Math.floor(Date.now() / 1000) * 1000;
}

export function randomEventId(): EventId {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function randomGroupId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Deterministic total order for tie-breaking: (at, author, id). */
export function eventOrder(a: BaseEvent, b: BaseEvent): number {
  return a.at - b.at || (a.author < b.author ? -1 : a.author > b.author ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Set union by event id. The whole merge rule. Idempotent: re-importing a stale copy is a no-op. */
export function mergeEvents(mine: LedgerEvent[], theirs: LedgerEvent[]): { merged: LedgerEvent[]; added: LedgerEvent[] } {
  const have = new Set(mine.map((e) => e.id));
  const added = theirs.filter((e) => !have.has(e.id));
  return { merged: [...mine, ...added], added };
}

// ---------------------------------------------------------------------------
// The effective view: what the log means once amends, voids and compacts are
// resolved. Pure and deterministic over the SET of events — order of arrival
// must never matter.

export interface EffectiveLedger {
  members: MemberEvent[]; // resolved (amended names applied), voids removed
  entries: (ExpenseEvent | PaymentEvent)[]; // resolved bodies, voided + subsumed removed
  opening: { member: EventId; currency: string; minor: number }[]; // from applied compacts
  /** Ids amended concurrently by more than one author — show an "edited twice" marker and offer the losing version. */
  conflicted: Map<EventId, AmendEvent[]>;
  /** Compacts skipped because they overlap an applied one (independent double-compaction). */
  skippedCompacts: CompactEvent[];
  /** Entry ids retired by applied compacts — safe to prune from the log along with their amend/void chains. */
  subsumed: Set<EventId>;
  liveEventCount: number;
}

export function effectiveLedger(events: LedgerEvent[]): EffectiveLedger {
  const amendsFor = new Map<EventId, AmendEvent[]>();
  const voided = new Set<EventId>();
  const compacts: CompactEvent[] = [];

  for (const e of events) {
    if (e.kind === 'amend') {
      const list = amendsFor.get(e.supersedes) ?? [];
      list.push(e);
      amendsFor.set(e.supersedes, list);
    } else if (e.kind === 'void') {
      voided.add(e.supersedes); // a void is not recoverable by an amend — stated rule
    } else if (e.kind === 'compact') {
      compacts.push(e);
    }
  }

  // Apply compacts in deterministic order, skipping any whose subsumed set
  // overlaps one already applied — two devices compacting independently must
  // not double-count the opening balances.
  compacts.sort(eventOrder);
  const subsumed = new Set<EventId>();
  const applied: CompactEvent[] = [];
  const skippedCompacts: CompactEvent[] = [];
  for (const c of compacts) {
    if (voided.has(c.id) || subsumed.has(c.id)) continue;
    if (c.subsumes.some((id) => subsumed.has(id))) {
      skippedCompacts.push(c);
      continue;
    }
    applied.push(c);
    for (const id of c.subsumes) subsumed.add(id);
  }
  // A later compact may subsume an earlier compact's id; drop the earlier one's balances.
  const openings = applied.filter((c) => !subsumed.has(c.id)).flatMap((c) => c.opening);

  const conflicted = new Map<EventId, AmendEvent[]>();
  const resolve = <T extends MemberEvent | ExpenseEvent | PaymentEvent>(e: T): T => {
    const amends = (amendsFor.get(e.id) ?? []).slice().sort(eventOrder);
    if (amends.length === 0) return e;
    const authors = new Set(amends.map((a) => a.author));
    if (authors.size > 1) conflicted.set(e.id, amends);
    const winner = amends[amends.length - 1];
    return { ...e, ...(winner.body as object), at: e.at } as T;
  };

  const members: MemberEvent[] = [];
  const entries: (ExpenseEvent | PaymentEvent)[] = [];
  for (const e of events) {
    if (voided.has(e.id) || subsumed.has(e.id)) continue;
    if (e.kind === 'member') members.push(resolve(e));
    else if (e.kind === 'expense' || e.kind === 'payment') entries.push(resolve(e));
  }
  members.sort(eventOrder);
  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || eventOrder(a, b));

  return {
    members,
    entries,
    opening: openings,
    conflicted,
    skippedCompacts,
    subsumed,
    liveEventCount: events.length,
  };
}

// ---------------------------------------------------------------------------
// Duplicate suspicion. "Did you get the taxi? I got the taxi" produces two
// true records no algorithm can tell from two genuine identical taxis — so
// this only ever SUGGESTS, at merge time, and never auto-voids.

export interface DuplicateSuspicion {
  a: ExpenseEvent;
  b: ExpenseEvent;
}

export function findDuplicateSuspicions(existing: LedgerEvent[], added: LedgerEvent[]): DuplicateSuspicion[] {
  const eff = effectiveLedger([...existing, ...added]);
  const addedIds = new Set(added.map((e) => e.id));
  const expenses = eff.entries.filter((e): e is ExpenseEvent => e.kind === 'expense');
  const out: DuplicateSuspicion[] = [];
  for (const b of expenses) {
    if (!addedIds.has(b.id)) continue;
    for (const a of expenses) {
      if (a.id === b.id || addedIds.has(a.id)) continue;
      if (a.payer === b.payer && a.minor === b.minor && a.currency === b.currency && daysApart(a.date, b.date) <= 2) {
        out.push({ a, b });
      }
    }
  }
  return out;
}

function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}
