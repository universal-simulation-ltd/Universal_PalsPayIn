// The message you paste into the group chat. Plain text, no markup — it is
// going into WhatsApp, not a renderer — and every number in it comes from the
// same functions the screen does, so the message and the app can never
// disagree.
//
// It states what is owed and how the payee likes to be paid. It does not
// claim anything has been paid, and it never asks anyone to send money to an
// account this app chose: the details are the ones that member typed about
// themselves, reproduced verbatim.

import type { BalancesResult } from './balances';
import type { EffectiveLedger, EventId, MemberHandles } from './events';
import { PAY_METHODS, offersMethod } from './events';
import { formatAmount } from './money';
import { bankDetailsText } from './paylinks';
import type { Transfer } from './settle';

export interface SummaryOptions {
  groupName: string;
  ledger: EffectiveLedger;
  bal: BalancesResult;
  /** The transfers currently shown on the Settle up tab, so the message and the screen say the same thing. */
  plan: Transfer[];
  /** Append each payee's own "here's how to pay me" details. */
  includePayDetails: boolean;
}

const METHOD_LABEL: Record<(typeof PAY_METHODS)[number], string> = {
  cash: 'cash',
  bank: 'a bank transfer',
  paypal: 'PayPal',
  monzo: 'Monzo',
  revolut: 'Revolut',
};

/** "a, b or c" — an Oxford-comma-free list, because it is being spoken to friends. */
function orList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`;
}

export function settlementMessage(opts: SummaryOptions): string {
  const { groupName, ledger, bal, plan, includePayDetails } = opts;
  const nameOf = (id: EventId) => ledger.members.find((m) => m.id === id)?.name ?? 'someone';
  const handlesOf = (id: EventId) => ledger.members.find((m) => m.id === id)?.handles;

  const lines: string[] = [`Hi everyone, here's where we stand on ${groupName}.`];

  // Totals and balances, per currency — the app never nets across currencies
  // and neither does the message.
  const spent = new Map<string, number>();
  for (const e of ledger.entries) {
    if (e.kind === 'expense') spent.set(e.currency, (spent.get(e.currency) ?? 0) + e.minor);
  }

  const currencies = [...new Set([...spent.keys(), ...bal.nets.keys()])].sort();
  for (const currency of currencies) {
    lines.push('');
    lines.push(`Total spent: ${formatAmount(spent.get(currency) ?? 0, currency)}`);
    const nets = [...(bal.nets.get(currency)?.entries() ?? [])].sort((a, b) => b[1] - a[1]);
    for (const [member, net] of nets) {
      if (net === 0) continue;
      lines.push(net > 0 ? `${nameOf(member)} is owed ${formatAmount(net, currency)}` : `${nameOf(member)} owes ${formatAmount(-net, currency)}`);
    }
  }

  if (plan.length === 0) {
    lines.push('');
    lines.push('All square — nothing to settle.');
  } else {
    lines.push('');
    lines.push(plan.length === 1 ? 'To settle up:' : `To settle up in ${plan.length} transfers:`);
    for (const t of plan) {
      lines.push(`- ${nameOf(t.from)} pays ${nameOf(t.to)} ${formatAmount(t.minor, t.currency)}`);
    }

    if (includePayDetails) {
      // One block per person being paid, in the order they first appear in the
      // plan, so whoever owes money reads their payee's details near the line
      // that named them.
      const payees: EventId[] = [];
      for (const t of plan) if (!payees.includes(t.to)) payees.push(t.to);
      for (const payee of payees) {
        const block = payDetailsBlock(nameOf(payee), handlesOf(payee));
        if (block) {
          lines.push('');
          lines.push(...block);
        }
      }
    }
  }

  lines.push('');
  lines.push("(Sent from Universal PalsPayIn — it's a record of who owes what. It never moves money.)");
  return lines.join('\n');
}

/** One payee's "feel free to pay me by…" paragraph, or null if they have offered nothing. */
export function payDetailsBlock(name: string, handles: MemberHandles | undefined): string[] | null {
  const offered = PAY_METHODS.filter((m) => offersMethod(handles, m));
  if (offered.length === 0) return null;

  const described = offered.map((m) => {
    if (m === 'paypal' && handles?.paypal) return `PayPal (paypal.me/${handles.paypal.trim()})`;
    if (m === 'monzo' && handles?.monzo) return `Monzo (monzo.me/${handles.monzo.trim()})`;
    if (m === 'revolut' && handles?.revolut) return `Revolut (revolut.me/${handles.revolut.trim()})`;
    return METHOD_LABEL[m];
  });

  const out = [`Paying ${name}: ${orList(described)}.`];
  const bank = offered.includes('bank') ? bankDetailsText(handles) : null;
  if (bank) out.push(...bank.split('\n').map((l) => `  ${l}`));
  return out;
}
