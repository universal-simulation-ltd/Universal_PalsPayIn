import { describe, expect, it } from 'vitest';
import { balances, pairwiseDebts } from './balances';
import { effectiveLedger, type ExpenseEvent, type LedgerEvent, type MemberEvent } from './events';
import { chooseSettlePlan } from './settle';
import { payDetailsBlock, settlementMessage } from './summary';

let n = 0;
const id = () => (n++).toString(16).padStart(12, '0');

function scenario(extraEvents: LedgerEvent[] = []) {
  const james: MemberEvent = { kind: 'member', id: id(), author: 'd', at: 1_700_000_000_000, name: 'James', colour: '#0ea5e9' };
  const john: MemberEvent = { kind: 'member', id: id(), author: 'd', at: 1_700_000_001_000, name: 'John', colour: '#f97316' };
  const jenny: MemberEvent = { kind: 'member', id: id(), author: 'd', at: 1_700_000_002_000, name: 'Jenny', colour: '#10b981' };
  // James pays £42.60, split evenly three ways: the others owe £14.20 each.
  const taxi: ExpenseEvent = {
    kind: 'expense', id: id(), author: 'd', at: 1_700_000_003_000, payer: james.id, minor: 4260, currency: 'GBP',
    date: '2026-08-01', description: 'Taxi', split: { mode: 'even', participants: [james.id, john.id, jenny.id] },
  };
  const events = [james, john, jenny, taxi, ...extraEvents];
  const ledger = effectiveLedger(events);
  const bal = balances(ledger);
  const plan = chooseSettlePlan(bal, pairwiseDebts(ledger)).plan;
  return { james, john, jenny, ledger, bal, plan, events };
}

describe('settlement message', () => {
  it('states the total spent, every net balance and the transfers that clear them', () => {
    const { ledger, bal, plan } = scenario();
    const msg = settlementMessage({ groupName: 'Weekend away', ledger, bal, plan, includePayDetails: false });

    expect(msg).toContain('Hi everyone, here\'s where we stand on Weekend away.');
    expect(msg).toContain('Total spent: £42.60');
    expect(msg).toContain('James is owed £28.40');
    expect(msg).toContain('John owes £14.20');
    expect(msg).toContain('Jenny owes £14.20');
    expect(msg).toContain('To settle up in 2 transfers:');
    expect(msg).toContain('- John pays James £14.20');
    expect(msg).toContain('- Jenny pays James £14.20');
    // The standing disclaimer travels with the numbers, not just the UI.
    expect(msg).toContain('It never moves money.');
  });

  it('is arithmetically closed: what people owe adds up to what they are owed', () => {
    const { ledger, bal, plan } = scenario();
    const msg = settlementMessage({ groupName: 'Weekend away', ledger, bal, plan, includePayDetails: false });
    const owed = [...msg.matchAll(/is owed £([\d.]+)/g)].reduce((a, m) => a + Number(m[1]), 0);
    const owes = [...msg.matchAll(/owes £([\d.]+)/g)].reduce((a, m) => a + Number(m[1]), 0);
    expect(owed).toBeCloseTo(owes, 2);
  });

  it('keeps currencies apart rather than netting them', () => {
    const { james, john, jenny, events } = scenario();
    const dinner: ExpenseEvent = {
      kind: 'expense', id: id(), author: 'd', at: 1_700_000_004_000, payer: john.id, minor: 3000, currency: 'EUR',
      date: '2026-08-02', description: 'Dinner', split: { mode: 'even', participants: [james.id, john.id, jenny.id] },
    };
    const ledger = effectiveLedger([...events, dinner]);
    const bal = balances(ledger);
    const plan = chooseSettlePlan(bal, pairwiseDebts(ledger)).plan;
    const msg = settlementMessage({ groupName: 'Trip', ledger, bal, plan, includePayDetails: false });

    expect(msg).toContain('Total spent: £42.60');
    expect(msg).toContain('Total spent: €30.00');
    expect(msg).not.toMatch(/Total spent: £72/); // no cross-currency addition, ever
  });

  it('says so plainly when there is nothing to settle', () => {
    const { ledger, bal } = scenario();
    const msg = settlementMessage({ groupName: 'Weekend away', ledger, bal, plan: [], includePayDetails: false });
    expect(msg).toContain('All square — nothing to settle.');
  });

  it('appends the payee\'s own details only when asked, and only for people being paid', () => {
    const { james, john, jenny, events } = scenario();
    const withHandles: LedgerEvent = {
      kind: 'amend', id: id(), author: 'd', at: 1_700_000_005_000, supersedes: james.id,
      body: { name: 'James', colour: james.colour, handles: { cash: true, bankAccount: { name: 'J Smith', sortCode: '00-00-00', number: '12345678' } } },
    };
    // Jenny offers a method too, but nobody is paying Jenny — her details must
    // not turn up in the message.
    const jennyHandles: LedgerEvent = {
      kind: 'amend', id: id(), author: 'd', at: 1_700_000_006_000, supersedes: jenny.id,
      body: { name: 'Jenny', colour: jenny.colour, handles: { paypal: 'jenny' } },
    };
    const ledger = effectiveLedger([...events, withHandles, jennyHandles]);
    const bal = balances(ledger);
    const plan = chooseSettlePlan(bal, pairwiseDebts(ledger)).plan;

    const without = settlementMessage({ groupName: 'Weekend away', ledger, bal, plan, includePayDetails: false });
    expect(without).not.toContain('12345678');

    const withDetails = settlementMessage({ groupName: 'Weekend away', ledger, bal, plan, includePayDetails: true });
    expect(withDetails).toContain('Paying James: cash or a bank transfer.');
    expect(withDetails).toContain('Account name: J Smith');
    expect(withDetails).toContain('Sort code: 00-00-00');
    expect(withDetails).toContain('Account number: 12345678');
    expect(withDetails).not.toContain('paypal.me/jenny');
    void john;
  });
});

describe('pay details block', () => {
  it('lists nothing for someone who has offered nothing', () => {
    expect(payDetailsBlock('Sam', undefined)).toBeNull();
    expect(payDetailsBlock('Sam', {})).toBeNull();
    expect(payDetailsBlock('Sam', { cash: false })).toBeNull();
  });

  it('names each method and reproduces the handles verbatim', () => {
    const block = payDetailsBlock('Sam', { cash: true, paypal: 'sam-pays', monzo: 'samm', revolut: 'samr' });
    expect(block?.[0]).toBe('Paying Sam: cash, PayPal (paypal.me/sam-pays), Monzo (monzo.me/samm) or Revolut (revolut.me/samr).');
  });

  it('keeps both the structured account and the free-text extras', () => {
    const block = payDetailsBlock('Sam', { bankAccount: { number: '12345678' }, bank: 'IBAN GB00 XXXX' });
    expect(block).toEqual(['Paying Sam: a bank transfer.', '  Account number: 12345678', '  IBAN GB00 XXXX']);
  });
});
