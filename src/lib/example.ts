// A ready-made group, so someone landing here for the first time can see what
// the app actually does without first typing three names and a restaurant
// bill. It is an ORDINARY group — real events, saved locally, editable and
// deletable like any other. Nothing in the ledger, the codec or the relay
// treats it specially; the one extra field (`example`) exists only so the UI
// can offer "delete this example" up front instead of burying it in a tab.
//
// It is deliberately the two splits people actually get stuck on: a meal
// where everyone ate something different (itemised, so the shares come out
// uneven and the service charge prorates over them), and a flat booking fee
// that genuinely is everyone's equally (even).

import { MEMBER_COLOURS } from './codec';
import {
  eventTimestamp, randomEventId, randomGroupId,
  type ExpenseEvent, type MemberEvent, type PaymentEvent,
} from './events';
import { deviceId, type StoredGroup } from './store';

export const EXAMPLE_NAME = 'Weekend in Bath (example)';

function daysBefore(today: string, n: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function buildExampleGroup(
  today: string = new Date().toISOString().slice(0, 10),
  author: string = deviceId(),
): StoredGroup {
  // Stamps step forward a second at a time so the three names list in the
  // order they are written here — same-second events tie-break on a random
  // id, which would shuffle them.
  const start = eventTimestamp() - 60_000;
  let tick = 0;
  const base = () => ({ id: randomEventId(), author, at: start + tick++ * 1000 });

  const [sam, alex, jo] = ['Sam', 'Alex', 'Jo'].map(
    (name, i): MemberEvent => ({ kind: 'member', ...base(), name, colour: MEMBER_COLOURS[i] }),
  );
  // Sam is the one being settled up with, so Sam shows what a pay method looks
  // like. Cash is the only one that can be pre-filled honestly: a PayPal or
  // Monzo handle here would either be invented — and belong to a real stranger
  // — or teach people that the app supplies handles. They come from the person.
  sam.handles = { cash: true };

  // £30 booking fee, paid by Alex weeks earlier, split evenly three ways.
  const reservation: ExpenseEvent = {
    kind: 'expense',
    ...base(),
    payer: alex.id,
    minor: 3000,
    currency: 'GBP',
    date: daysBefore(today, 9),
    description: 'Table reservation fee',
    category: 'Booking',
    split: { mode: 'even', participants: [sam.id, alex.id, jo.id] },
  };

  // £83.00 of food and wine + £10.38 service (12.5%). Sam paid the lot.
  // Items 2450 + 1600 + 1550 + 2700 = 8300; 8300 + 1038 = 9338 = the total.
  const dinner: ExpenseEvent = {
    kind: 'expense',
    ...base(),
    payer: sam.id,
    minor: 9338,
    currency: 'GBP',
    date: daysBefore(today, 2),
    description: 'Dinner at The Old Mill',
    category: 'Food & drink',
    split: {
      mode: 'itemised',
      items: [
        { label: 'Steak', minor: 2450, assignees: [sam.id] },
        { label: 'Pasta', minor: 1600, assignees: [alex.id] },
        { label: 'Risotto', minor: 1550, assignees: [jo.id] },
        { label: 'Wine for the table', minor: 2700, assignees: [sam.id, alex.id, jo.id] },
      ],
      adjustments: [{ kind: 'service', minor: 1038, alloc: 'prorata' }],
    },
  };

  // A claim, not a confirmation — Jo says this went out, and the ledger
  // records it as Jo's word (§18.4). Leaves Alex and Jo still owing Sam.
  const payback: PaymentEvent = {
    kind: 'payment',
    ...base(),
    from: jo.id,
    to: sam.id,
    minor: 2000,
    currency: 'GBP',
    date: daysBefore(today, 1),
    note: 'Bank transfer',
  };

  return {
    groupId: randomGroupId(),
    name: EXAMPLE_NAME,
    events: [sam, alex, jo, reservation, dinner, payback],
    example: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
