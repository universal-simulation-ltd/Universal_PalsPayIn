// The share link: events → compact positional binary → deflate-raw →
// base64url in the HASH FRAGMENT. A fragment is never transmitted to any
// server — that is both the privacy property and why the 8 KB request-line
// limit does not apply. The binding constraint is not the browser, it is the
// messaging app: links past ~2,000 chars get rewritten or truncated
// unpredictably and SILENTLY, so the UI carries an honest size meter and
// offers the JSON file once the link outgrows a QR.

import type {
  AmendEvent, CompactEvent, EventId, ExpenseEvent, Group, LedgerEvent,
  MemberEvent, PaymentEvent, SplitSpec, VoidEvent,
} from './events';

const MAGIC = [0x55, 0x50, 0x31]; // "UP1"
const FORMAT_VERSION = 1;
const EPOCH_2020 = Date.UTC(2020, 0, 1);

export const MEMBER_COLOURS = [
  '#0ea5e9', '#f97316', '#10b981', '#8b5cf6', '#ef4444', '#eab308',
  '#14b8a6', '#ec4899', '#64748b', '#84cc16', '#06b6d4', '#a855f7',
];

// --------------------------------------------------------------------------- writer

class Writer {
  private buf = new Uint8Array(1024);
  private len = 0;
  private ensure(n: number) {
    if (this.len + n <= this.buf.length) return;
    const next = new Uint8Array(Math.max(this.buf.length * 2, this.len + n));
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }
  byte(b: number) {
    this.ensure(1);
    this.buf[this.len++] = b & 0xff;
  }
  bytes(bs: Uint8Array | number[]) {
    this.ensure(bs.length);
    this.buf.set(bs instanceof Uint8Array ? bs : Uint8Array.from(bs), this.len);
    this.len += bs.length;
  }
  varint(n: number) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`varint: bad ${n}`);
    while (n >= 0x80) {
      this.byte((n & 0x7f) | 0x80);
      n = Math.floor(n / 128);
    }
    this.byte(n);
  }
  zigzag(n: number) {
    this.varint(n < 0 ? -n * 2 - 1 : n * 2);
  }
  string(s: string) {
    const b = new TextEncoder().encode(s);
    this.varint(b.length);
    this.bytes(b);
  }
  hexId(id: EventId) {
    if (!/^[0-9a-f]{12}$/.test(id)) throw new Error(`bad event id ${id}`);
    for (let i = 0; i < 12; i += 2) this.byte(parseInt(id.slice(i, i + 2), 16));
  }
  out(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

class Reader {
  private pos = 0;
  constructor(private buf: Uint8Array) {}
  get done() {
    return this.pos >= this.buf.length;
  }
  byte(): number {
    if (this.pos >= this.buf.length) throw new Error('unexpected end of data');
    return this.buf[this.pos++];
  }
  bytes(n: number): Uint8Array {
    if (this.pos + n > this.buf.length) throw new Error('unexpected end of data');
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  varint(): number {
    let n = 0;
    let mult = 1;
    for (;;) {
      const b = this.byte();
      n += (b & 0x7f) * mult;
      if (!(b & 0x80)) return n;
      mult *= 128;
      if (mult > 2 ** 53) throw new Error('varint too large');
    }
  }
  zigzag(): number {
    const n = this.varint();
    return n % 2 === 0 ? n / 2 : -(n + 1) / 2;
  }
  string(): string {
    return new TextDecoder().decode(this.bytes(this.varint()));
  }
  hexId(): EventId {
    return Array.from(this.bytes(6), (b) => b.toString(16).padStart(2, '0')).join('');
  }
}

// --------------------------------------------------------------------------- encode

export function encodeLedger(group: Pick<Group, 'groupId' | 'name' | 'events'>): Uint8Array {
  const w = new Writer();
  w.bytes(MAGIC);
  w.byte(FORMAT_VERSION);
  for (let i = 0; i < 32; i += 2) w.byte(parseInt(group.groupId.slice(i, i + 2), 16));
  w.string(group.name);

  // Tables. Members are referenced constantly, so they get varint indices;
  // authors and currencies likewise.
  const memberIds: EventId[] = [];
  const authors: string[] = [];
  const currencies: string[] = [];
  const memberIdx = (id: EventId) => tableIdx(memberIds, id);
  const authorIdx = (a: string) => tableIdx(authors, a);
  const currencyIdx = (c: string) => tableIdx(currencies, c);

  collectRefs(group.events, memberIds, authors, currencies);

  w.varint(memberIds.length);
  for (const id of memberIds) w.hexId(id);
  w.varint(authors.length);
  for (const a of authors) w.string(a);
  w.varint(currencies.length);
  for (const c of currencies) {
    if (!/^[A-Z]{3}$/.test(c)) throw new Error(`bad currency ${c}`);
    w.bytes(new TextEncoder().encode(c));
  }

  w.varint(group.events.length);
  for (const e of group.events) {
    w.hexId(e.id);
    w.varint(authorIdx(e.author));
    w.varint(Math.max(0, Math.round((e.at - EPOCH_2020) / 1000)));
    switch (e.kind) {
      case 'member':
        w.byte(0);
        encodeMemberBody(w, e);
        break;
      case 'expense':
        w.byte(1);
        encodeExpenseBody(w, e, memberIdx, currencyIdx);
        break;
      case 'payment':
        w.byte(2);
        encodePaymentBody(w, e, memberIdx, currencyIdx);
        break;
      case 'amend': {
        w.byte(3);
        w.hexId(e.supersedes);
        const body = e.body as Record<string, unknown>;
        if ('payer' in body) {
          w.byte(1);
          encodeExpenseBody(w, body as never, memberIdx, currencyIdx);
        } else if ('from' in body) {
          w.byte(2);
          encodePaymentBody(w, body as never, memberIdx, currencyIdx);
        } else {
          w.byte(0);
          encodeMemberBody(w, body as never);
        }
        break;
      }
      case 'void':
        w.byte(4);
        w.hexId(e.supersedes);
        break;
      case 'compact':
        w.byte(5);
        w.varint(e.subsumes.length);
        for (const id of e.subsumes) w.hexId(id);
        w.varint(e.opening.length);
        for (const o of e.opening) {
          w.varint(memberIdx(o.member));
          w.varint(currencyIdx(o.currency));
          w.zigzag(o.minor);
        }
        break;
    }
  }
  return w.out();
}

function tableIdx<T>(table: T[], v: T): number {
  const i = table.indexOf(v);
  if (i >= 0) return i;
  table.push(v);
  return table.length - 1;
}

function collectRefs(events: LedgerEvent[], memberIds: EventId[], authors: string[], currencies: string[]) {
  const member = (id: EventId) => tableIdx(memberIds, id);
  const currency = (c: string) => tableIdx(currencies, c);
  const bodyRefs = (e: { kind?: string } & Record<string, unknown>) => {
    if ('payer' in e) {
      const x = e as unknown as ExpenseEvent;
      member(x.payer);
      currency(x.currency);
      if (x.charged) currency(x.charged.currency);
      splitRefs(x.split);
    } else if ('from' in e) {
      const p = e as unknown as PaymentEvent;
      member(p.from);
      member(p.to);
      currency(p.currency);
      if (p.charged) currency(p.charged.currency);
    }
  };
  const splitRefs = (s: SplitSpec) => {
    if (s.mode === 'even') s.participants.forEach(member);
    else if (s.mode === 'exact') s.amounts.forEach((a) => member(a.member));
    else if (s.mode === 'shares') s.shares.forEach((a) => member(a.member));
    else {
      s.items.forEach((i) => i.assignees.forEach(member));
      s.adjustments.forEach((a) => {
        if (typeof a.alloc === 'object') member(a.alloc.member);
      });
    }
  };
  for (const e of events) {
    tableIdx(authors, e.author);
    if (e.kind === 'member') member(e.id);
    else if (e.kind === 'expense' || e.kind === 'payment') bodyRefs(e as never);
    else if (e.kind === 'amend') bodyRefs(e.body as never);
    else if (e.kind === 'compact') {
      e.opening.forEach((o) => {
        member(o.member);
        currency(o.currency);
      });
    }
  }
}

function encodeMemberBody(w: Writer, m: Pick<MemberEvent, 'name' | 'colour' | 'handle'>) {
  w.string(m.name);
  const pal = MEMBER_COLOURS.indexOf(m.colour);
  if (pal >= 0) w.byte(pal);
  else {
    w.byte(255);
    w.string(m.colour);
  }
  w.byte(m.handle ? 1 : 0);
  if (m.handle) w.string(m.handle);
}

function decodeMemberBody(r: Reader): Pick<MemberEvent, 'name' | 'colour' | 'handle'> {
  const name = r.string();
  const pal = r.byte();
  const colour = pal === 255 ? r.string() : MEMBER_COLOURS[pal] ?? MEMBER_COLOURS[0];
  const hasHandle = r.byte() === 1;
  const handle = hasHandle ? r.string() : undefined;
  return { name, colour, ...(handle ? { handle } : {}) };
}

function encodeDate(w: Writer, iso: string) {
  const days = Math.round((Date.parse(iso + 'T00:00:00Z') - EPOCH_2020) / 86_400_000);
  w.varint(Math.max(0, days));
}

function decodeDate(r: Reader): string {
  return new Date(EPOCH_2020 + r.varint() * 86_400_000).toISOString().slice(0, 10);
}

function encodeExpenseBody(
  w: Writer,
  e: Pick<ExpenseEvent, 'payer' | 'minor' | 'currency' | 'date' | 'description' | 'category' | 'split' | 'charged'>,
  memberIdx: (id: EventId) => number,
  currencyIdx: (c: string) => number,
) {
  w.varint(memberIdx(e.payer));
  w.zigzag(e.minor);
  w.varint(currencyIdx(e.currency));
  encodeDate(w, e.date);
  w.string(e.description);
  w.byte((e.category ? 1 : 0) | (e.charged ? 2 : 0));
  if (e.category) w.string(e.category);
  if (e.charged) {
    w.varint(currencyIdx(e.charged.currency));
    w.zigzag(e.charged.minor);
  }
  const s = e.split;
  if (s.mode === 'even') {
    w.byte(0);
    w.varint(s.participants.length);
    for (const p of s.participants) w.varint(memberIdx(p));
  } else if (s.mode === 'exact') {
    w.byte(1);
    w.varint(s.amounts.length);
    for (const a of s.amounts) {
      w.varint(memberIdx(a.member));
      w.zigzag(a.minor);
    }
  } else if (s.mode === 'shares') {
    w.byte(2);
    w.varint(s.shares.length);
    for (const a of s.shares) {
      w.varint(memberIdx(a.member));
      w.varint(a.weight);
    }
  } else {
    w.byte(3);
    w.varint(s.items.length);
    for (const item of s.items) {
      w.string(item.label);
      w.zigzag(item.minor);
      w.varint(item.assignees.length);
      for (const a of item.assignees) w.varint(memberIdx(a));
    }
    w.varint(s.adjustments.length);
    for (const adj of s.adjustments) {
      w.byte({ tax: 0, tip: 1, service: 2, discount: 3 }[adj.kind]);
      w.zigzag(adj.minor);
      if (adj.alloc === 'prorata') w.byte(0);
      else if (adj.alloc === 'even') w.byte(1);
      else {
        w.byte(2);
        w.varint(memberIdx(adj.alloc.member));
      }
    }
  }
}

function encodePaymentBody(
  w: Writer,
  p: Pick<PaymentEvent, 'from' | 'to' | 'minor' | 'currency' | 'date' | 'note' | 'charged'>,
  memberIdx: (id: EventId) => number,
  currencyIdx: (c: string) => number,
) {
  w.varint(memberIdx(p.from));
  w.varint(memberIdx(p.to));
  w.zigzag(p.minor);
  w.varint(currencyIdx(p.currency));
  encodeDate(w, p.date);
  w.byte((p.note ? 1 : 0) | (p.charged ? 2 : 0));
  if (p.note) w.string(p.note);
  if (p.charged) {
    w.varint(currencyIdx(p.charged.currency));
    w.zigzag(p.charged.minor);
  }
}

// --------------------------------------------------------------------------- decode

export function decodeLedger(data: Uint8Array): Pick<Group, 'groupId' | 'name' | 'events'> {
  const r = new Reader(data);
  for (const m of MAGIC) if (r.byte() !== m) throw new Error('Not a PalsPayIn ledger');
  const version = r.byte();
  if (version !== FORMAT_VERSION) throw new Error(`Ledger format v${version} is newer than this app understands`);
  const groupId = Array.from(r.bytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
  const name = r.string();

  const memberIds: EventId[] = [];
  const nMembers = r.varint();
  for (let i = 0; i < nMembers; i++) memberIds.push(r.hexId());
  const authors: string[] = [];
  const nAuthors = r.varint();
  for (let i = 0; i < nAuthors; i++) authors.push(r.string());
  const currencies: string[] = [];
  const nCurrencies = r.varint();
  for (let i = 0; i < nCurrencies; i++) currencies.push(new TextDecoder().decode(r.bytes(3)));

  const member = (i: number) => {
    if (i >= memberIds.length) throw new Error('corrupt ledger: member index out of range');
    return memberIds[i];
  };
  const currency = (i: number) => {
    if (i >= currencies.length) throw new Error('corrupt ledger: currency index out of range');
    return currencies[i];
  };

  const decodeExpenseBody = () => {
    const payer = member(r.varint());
    const minor = r.zigzag();
    const cur = currency(r.varint());
    const date = decodeDate(r);
    const description = r.string();
    const flags = r.byte();
    const category = flags & 1 ? r.string() : undefined;
    const charged = flags & 2 ? { currency: currency(r.varint()), minor: r.zigzag() } : undefined;
    const mode = r.byte();
    let split: SplitSpec;
    if (mode === 0) {
      const n = r.varint();
      split = { mode: 'even', participants: Array.from({ length: n }, () => member(r.varint())) };
    } else if (mode === 1) {
      const n = r.varint();
      split = { mode: 'exact', amounts: Array.from({ length: n }, () => ({ member: member(r.varint()), minor: r.zigzag() })) };
    } else if (mode === 2) {
      const n = r.varint();
      split = { mode: 'shares', shares: Array.from({ length: n }, () => ({ member: member(r.varint()), weight: r.varint() })) };
    } else if (mode === 3) {
      const nItems = r.varint();
      const items = Array.from({ length: nItems }, () => ({
        label: r.string(),
        minor: r.zigzag(),
        assignees: Array.from({ length: r.varint() }, () => member(r.varint())),
      }));
      const nAdj = r.varint();
      const adjustments = Array.from({ length: nAdj }, () => {
        const kind = (['tax', 'tip', 'service', 'discount'] as const)[r.byte()];
        const minor = r.zigzag();
        const allocTag = r.byte();
        const alloc = allocTag === 0 ? ('prorata' as const) : allocTag === 1 ? ('even' as const) : { member: member(r.varint()) };
        return { kind, minor, alloc };
      });
      split = { mode: 'itemised', items, adjustments };
    } else {
      throw new Error('corrupt ledger: unknown split mode');
    }
    return { payer, minor, currency: cur, date, description, split, ...(category ? { category } : {}), ...(charged ? { charged } : {}) };
  };

  const decodePaymentBody = () => {
    const from = member(r.varint());
    const to = member(r.varint());
    const minor = r.zigzag();
    const cur = currency(r.varint());
    const date = decodeDate(r);
    const flags = r.byte();
    const note = flags & 1 ? r.string() : undefined;
    const charged = flags & 2 ? { currency: currency(r.varint()), minor: r.zigzag() } : undefined;
    return { from, to, minor, currency: cur, date, ...(note ? { note } : {}), ...(charged ? { charged } : {}) };
  };

  const nEvents = r.varint();
  const events: LedgerEvent[] = [];
  for (let i = 0; i < nEvents; i++) {
    const id = r.hexId();
    const author = authors[r.varint()] ?? '';
    const at = EPOCH_2020 + r.varint() * 1000;
    const tag = r.byte();
    if (tag === 0) {
      events.push({ kind: 'member', id, author, at, ...decodeMemberBody(r) } as MemberEvent);
    } else if (tag === 1) {
      events.push({ kind: 'expense', id, author, at, ...decodeExpenseBody() } as ExpenseEvent);
    } else if (tag === 2) {
      events.push({ kind: 'payment', id, author, at, ...decodePaymentBody() } as PaymentEvent);
    } else if (tag === 3) {
      const supersedes = r.hexId();
      const bodyTag = r.byte();
      const body = bodyTag === 1 ? decodeExpenseBody() : bodyTag === 2 ? decodePaymentBody() : decodeMemberBody(r);
      events.push({ kind: 'amend', id, author, at, supersedes, body } as AmendEvent);
    } else if (tag === 4) {
      events.push({ kind: 'void', id, author, at, supersedes: r.hexId() } as VoidEvent);
    } else if (tag === 5) {
      const subsumes = Array.from({ length: r.varint() }, () => r.hexId());
      const opening = Array.from({ length: r.varint() }, () => ({
        member: member(r.varint()),
        currency: currency(r.varint()),
        minor: r.zigzag(),
      }));
      events.push({ kind: 'compact', id, author, at, subsumes, opening } as CompactEvent);
    } else {
      throw new Error('corrupt ledger: unknown event kind');
    }
  }
  return { groupId, name, events };
}

// --------------------------------------------------------------------------- compression + base64url

async function pump(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(cs);
  return pump(stream);
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return pump(stream);
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** The share-link payload (goes after `#d=`). */
export async function encodeShareFragment(group: Pick<Group, 'groupId' | 'name' | 'events'>): Promise<string> {
  return toBase64Url(await deflate(encodeLedger(group)));
}

export async function decodeShareFragment(fragment: string): Promise<Pick<Group, 'groupId' | 'name' | 'events'>> {
  return decodeLedger(await inflate(fromBase64Url(fragment)));
}

/** Honest link-size verdict. The messaging app is the ceiling, not the browser. */
export type LinkSizeVerdict = 'qr' | 'safe' | 'fragile';

export function linkSizeVerdict(chars: number): LinkSizeVerdict {
  if (chars <= 1000) return 'qr'; // a phone camera will actually scan this
  if (chars <= 2000) return 'safe'; // survives messaging apps and Safelinks
  return 'fragile'; // link rewriters break these silently — offer the file
}

// --------------------------------------------------------------------------- JSON file

export function exportJson(group: Pick<Group, 'groupId' | 'name' | 'events'>): string {
  return JSON.stringify({ format: 'palspayin-ledger', version: 1, groupId: group.groupId, name: group.name, events: group.events }, null, 2);
}

export function importJson(text: string): Pick<Group, 'groupId' | 'name' | 'events'> {
  const parsed = JSON.parse(text) as { format?: string; version?: number; groupId?: string; name?: string; events?: LedgerEvent[] };
  if (parsed.format !== 'palspayin-ledger' || !Array.isArray(parsed.events)) {
    throw new Error('Not a PalsPayIn ledger file');
  }
  if ((parsed.version ?? 1) > 1) throw new Error('This file was made by a newer version of the app');
  if (!parsed.groupId || !/^[0-9a-f]{32}$/.test(parsed.groupId)) throw new Error('Ledger file has no valid group id');
  for (const e of parsed.events) {
    if (!e || typeof e !== 'object' || !/^[0-9a-f]{12}$/.test(e.id ?? '') || typeof e.kind !== 'string') {
      throw new Error('Ledger file contains a malformed event');
    }
  }
  return { groupId: parsed.groupId, name: parsed.name ?? 'Imported group', events: parsed.events };
}
