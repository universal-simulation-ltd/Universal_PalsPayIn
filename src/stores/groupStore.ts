import { create } from 'zustand';
import {
  eventTimestamp, findDuplicateSuspicions, mergeEvents, randomEventId, randomGroupId,
  type DuplicateSuspicion, type EventId, type ExpenseEvent, type LedgerEvent, type MemberEvent, type MemberHandles, type PaymentEvent, type SplitSpec,
} from '../lib/events';
import { buildCompact, pruneCompacted } from '../lib/compact';
import { decodeShareFragment, importJson, MEMBER_COLOURS } from '../lib/codec';
import { deleteRelayGroup, generateRelayKey, parseCapabilityFragment, syncWithRelay } from '../lib/relay';
import type { RecurringTemplate } from '../lib/recurring';
import { deleteGroup as idbDeleteGroup, deletePhoto, deviceId, loadGroups, saveGroup, type StoredGroup } from '../lib/store';

export interface PendingSuspicions {
  groupId: string;
  suspicions: DuplicateSuspicion[];
}

interface GroupState {
  groups: StoredGroup[];
  activeId: string | null;
  loaded: boolean;
  importNotice: string | null;
  pendingSuspicions: PendingSuspicions | null;
  sync: { syncing: boolean; problem: string | null; lastSync: number | null };

  init: () => Promise<void>;
  open: (groupId: string | null) => void;
  dismissNotice: () => void;

  createGroup: (name: string, memberNames: string[]) => Promise<string>;
  removeGroup: (groupId: string) => Promise<void>;

  addMember: (name: string) => Promise<void>;
  amendMember: (memberId: EventId, body: { name: string; colour: string; handles?: MemberHandles }) => Promise<void>;
  addExpense: (fields: ExpenseFields) => Promise<void>;
  amendExpense: (originalId: EventId, fields: ExpenseFields) => Promise<void>;
  addPayment: (fields: PaymentFields) => Promise<void>;
  /** Several payments as one append — "I paid everyone back" is one action, not N syncs. */
  addPayments: (fields: PaymentFields[]) => Promise<void>;
  amendPayment: (originalId: EventId, fields: PaymentFields) => Promise<void>;
  voidEntry: (entryId: EventId) => Promise<void>;
  compactBefore: (cutoffDate: string) => Promise<number>;

  addRecurring: (t: Omit<RecurringTemplate, 'id' | 'createdOn' | 'lastAdded'>) => Promise<void>;
  removeRecurring: (templateId: string) => Promise<void>;
  /** Materialise a due occurrence as an ordinary expense event (or skip it). */
  addOccurrence: (templateId: string, dueDate: string) => Promise<void>;
  skipOccurrence: (templateId: string, dueDate: string) => Promise<void>;

  importPayload: (payload: { groupId: string; name: string; events: LedgerEvent[] }) => Promise<void>;
  importFile: (text: string) => Promise<void>;
  resolveSuspicions: (voidIds: EventId[]) => Promise<void>;

  enableRelay: () => Promise<void>;
  joinRelay: (groupId: string, key: string, name: string) => Promise<void>;
  disableRelay: (alsoDeleteRemote: boolean) => Promise<void>;
  syncNow: () => Promise<void>;
}

export interface ExpenseFields {
  payer: EventId;
  minor: number;
  currency: string;
  date: string;
  description: string;
  category?: string;
  split: SplitSpec;
  charged?: { currency: string; minor: number };
}

export interface PaymentFields {
  from: EventId;
  to: EventId;
  minor: number;
  currency: string;
  date: string;
  note?: string;
  charged?: { currency: string; minor: number };
}

function base() {
  return { id: randomEventId(), author: deviceId(), at: eventTimestamp() };
}

let bootstrapped = false; // StrictMode double-invokes effects; the hash import must run once

export const useGroupStore = create<GroupState>((set, get) => {
  const activeGroup = () => {
    const { groups, activeId } = get();
    const g = groups.find((x) => x.groupId === activeId);
    if (!g) throw new Error('No active group');
    return g;
  };

  const persist = async (updated: StoredGroup) => {
    await saveGroup(updated);
    set((s) => ({
      groups: s.groups.map((g) => (g.groupId === updated.groupId ? { ...updated, updatedAt: Date.now() } : g)),
    }));
  };

  const append = async (events: LedgerEvent[]) => {
    const g = activeGroup();
    await persist({ ...g, events: [...g.events, ...events] });
    if (g.relayEnabled) void get().syncNow();
  };

  const mergeIntoGroup = async (g: StoredGroup, incoming: LedgerEvent[], sourceLabel: string) => {
    const { merged, added } = mergeEvents(g.events, incoming);
    if (added.length > 0) {
      const suspicions = findDuplicateSuspicions(g.events, added);
      await persist({ ...g, events: merged });
      if (suspicions.length > 0) {
        set({ pendingSuspicions: { groupId: g.groupId, suspicions } });
      }
      set({ importNotice: `${added.length} new ${added.length === 1 ? 'entry' : 'entries'} merged from ${sourceLabel}.` });
    } else {
      set({ importNotice: `Already up to date — nothing new in that ${sourceLabel}.` });
    }
  };

  return {
    groups: [],
    activeId: null,
    loaded: false,
    importNotice: null,
    pendingSuspicions: null,
    sync: { syncing: false, problem: null, lastSync: null },

    init: async () => {
      if (bootstrapped) return;
      bootstrapped = true;
      const groups = await loadGroups();
      set({ groups, loaded: true });

      const hash = location.hash.slice(1);
      if (!hash) return;
      try {
        const cap = parseCapabilityFragment(hash);
        if (cap) {
          const name = new URLSearchParams(hash).get('n') ?? 'Shared group';
          await get().joinRelay(cap.groupId, cap.key, name);
        } else if (hash.startsWith('d=')) {
          const payload = await decodeShareFragment(hash.slice(2));
          await get().importPayload(payload);
        }
      } catch {
        set({ importNotice: 'That link did not contain a readable ledger — it may have been truncated by a messaging app. Ask for the file instead.' });
      } finally {
        history.replaceState(null, '', location.pathname + location.search);
      }
    },

    open: (groupId) => set({ activeId: groupId, sync: { syncing: false, problem: null, lastSync: null } }),
    dismissNotice: () => set({ importNotice: null }),

    createGroup: async (name, memberNames) => {
      const groupId = randomGroupId();
      const members: MemberEvent[] = memberNames
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n, i) => ({ kind: 'member' as const, ...base(), name: n, colour: MEMBER_COLOURS[i % MEMBER_COLOURS.length] }));
      const group: StoredGroup = {
        groupId,
        name: name.trim() || 'New group',
        events: members,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveGroup(group);
      set((s) => ({ groups: [group, ...s.groups], activeId: groupId }));
      return groupId;
    },

    removeGroup: async (groupId) => {
      await idbDeleteGroup(groupId);
      set((s) => ({ groups: s.groups.filter((g) => g.groupId !== groupId), activeId: s.activeId === groupId ? null : s.activeId }));
    },

    addMember: async (name) => {
      const g = activeGroup();
      const used = g.events.filter((e) => e.kind === 'member').length;
      await append([{ kind: 'member', ...base(), name: name.trim(), colour: MEMBER_COLOURS[used % MEMBER_COLOURS.length] } as MemberEvent]);
    },

    amendMember: async (memberId, body) => {
      await append([{ kind: 'amend', ...base(), supersedes: memberId, body }]);
    },

    addExpense: async (fields) => {
      await append([{ kind: 'expense', ...base(), ...fields } as ExpenseEvent]);
    },

    amendExpense: async (originalId, fields) => {
      await append([{ kind: 'amend', ...base(), supersedes: originalId, body: fields }]);
    },

    addPayment: async (fields) => {
      await append([{ kind: 'payment', ...base(), ...fields } as PaymentEvent]);
    },

    addPayments: async (list) => {
      if (list.length === 0) return;
      // Separate events, so each one can be edited or removed on its own
      // later — paying the group back is a convenience at the form, never a
      // new kind of entry the ledger has to understand.
      await append(list.map((fields) => ({ kind: 'payment', ...base(), ...fields }) as PaymentEvent));
    },

    amendPayment: async (originalId, fields) => {
      await append([{ kind: 'amend', ...base(), supersedes: originalId, body: fields }]);
    },

    voidEntry: async (entryId) => {
      await append([{ kind: 'void', ...base(), supersedes: entryId }]);
      // A removed entry's local receipt photo has nothing to attach to.
      const { activeId } = get();
      if (activeId) void deletePhoto(activeId, entryId);
    },

    addRecurring: async (t) => {
      const g = activeGroup();
      const template: RecurringTemplate = { ...t, id: randomEventId(), createdOn: new Date().toISOString().slice(0, 10) };
      await persist({ ...g, recurring: [...(g.recurring ?? []), template] });
    },

    removeRecurring: async (templateId) => {
      const g = activeGroup();
      await persist({ ...g, recurring: (g.recurring ?? []).filter((t) => t.id !== templateId) });
    },

    addOccurrence: async (templateId, dueDate) => {
      const g = activeGroup();
      const t = (g.recurring ?? []).find((x) => x.id === templateId);
      if (!t) return;
      await append([
        {
          kind: 'expense', ...base(), payer: t.payer, minor: t.minor, currency: t.currency,
          date: dueDate, description: t.description, category: 'Recurring', split: t.split,
        } as ExpenseEvent,
      ]);
      const fresh = activeGroup();
      await persist({
        ...fresh,
        recurring: (fresh.recurring ?? []).map((x) => (x.id === templateId ? { ...x, lastAdded: dueDate } : x)),
      });
    },

    skipOccurrence: async (templateId, dueDate) => {
      const g = activeGroup();
      await persist({
        ...g,
        recurring: (g.recurring ?? []).map((x) => (x.id === templateId ? { ...x, lastAdded: dueDate } : x)),
      });
    },

    compactBefore: async (cutoffDate) => {
      const g = activeGroup();
      const compact = buildCompact(g.events, cutoffDate, deviceId());
      if (!compact) return 0;
      const events = pruneCompacted([...g.events, compact]);
      await persist({ ...g, events });
      if (g.relayEnabled) void get().syncNow();
      return compact.subsumes.length;
    },

    importPayload: async (payload) => {
      const existing = get().groups.find((g) => g.groupId === payload.groupId);
      if (existing) {
        set({ activeId: existing.groupId });
        await mergeIntoGroup(existing, payload.events, 'link');
      } else {
        const group: StoredGroup = { ...payload, createdAt: Date.now(), updatedAt: Date.now() };
        await saveGroup(group);
        set((s) => ({ groups: [group, ...s.groups], activeId: group.groupId, importNotice: `Joined “${group.name}”.` }));
      }
    },

    importFile: async (text) => {
      const payload = importJson(text);
      const existing = get().groups.find((g) => g.groupId === payload.groupId);
      if (existing) {
        set({ activeId: existing.groupId });
        await mergeIntoGroup(existing, payload.events, 'file');
      } else {
        await get().importPayload(payload);
      }
    },

    resolveSuspicions: async (voidIds) => {
      if (voidIds.length > 0) {
        await append(voidIds.map((id) => ({ kind: 'void' as const, ...base(), supersedes: id })));
      }
      set({ pendingSuspicions: null });
    },

    enableRelay: async () => {
      const g = activeGroup();
      const relayKey = await generateRelayKey();
      await persist({ ...g, relayKey, relayEnabled: true, relayCursor: 0 });
      await get().syncNow();
    },

    joinRelay: async (groupId, key, name) => {
      const existing = get().groups.find((g) => g.groupId === groupId);
      if (existing) {
        if (!existing.relayEnabled) await persist({ ...existing, relayKey: key, relayEnabled: true, relayCursor: existing.relayCursor ?? 0 });
        set({ activeId: groupId });
      } else {
        const group: StoredGroup = {
          groupId,
          name,
          events: [],
          relayKey: key,
          relayEnabled: true,
          relayCursor: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await saveGroup(group);
        set((s) => ({ groups: [group, ...s.groups], activeId: groupId }));
      }
      await get().syncNow();
    },

    disableRelay: async (alsoDeleteRemote) => {
      const g = activeGroup();
      if (alsoDeleteRemote) await deleteRelayGroup(g.groupId);
      await persist({ ...g, relayEnabled: false });
    },

    syncNow: async () => {
      const { sync } = get();
      if (sync.syncing) return;
      let g: StoredGroup;
      try {
        g = activeGroup();
      } catch {
        return;
      }
      if (!g.relayEnabled || !g.relayKey) return;
      set({ sync: { ...sync, syncing: true, problem: null } });
      const result = await syncWithRelay(g.groupId, g.relayKey, g.events, g.relayCursor ?? 0);
      const fresh = get().groups.find((x) => x.groupId === g.groupId);
      if (!fresh) return;
      if (result.ok) {
        const { merged, added } = mergeEvents(fresh.events, result.pulled);
        if (added.length > 0) {
          const suspicions = findDuplicateSuspicions(fresh.events, added);
          if (suspicions.length > 0) set({ pendingSuspicions: { groupId: g.groupId, suspicions } });
        }
        await persist({ ...fresh, events: merged, relayCursor: result.cursor });
        set({ sync: { syncing: false, problem: null, lastSync: Date.now() } });
      } else {
        set({ sync: { syncing: false, problem: result.problem ?? 'Sync failed.', lastSync: get().sync.lastSync } });
      }
    },
  };
});
