// Phase 2 — the encrypted append-only relay.
//
// The group's identity is a capability URL: #g=<group-id>.<256-bit key>. The
// KEY LIVES IN THE FRAGMENT AND NEVER REACHES THE SERVER. Events are
// encrypted client-side with AES-GCM under that key and POSTed to one flat
// table (group_id, event_id, ciphertext, created_at); devices poll and union
// whatever they can decrypt. The relay holds bytes it cannot read.
//
// Consequences, stated where the code lives:
//  - The URL IS the credential. Leak the link, leak the ledger.
//  - Lost link = lost group's relay copy, with no recovery — we cannot decrypt.
//  - Anyone holding the link can also DELETE the relay copy (that is the GDPR
//    deletion path); every device still holds a complete local ledger.

import type { LedgerEvent } from './events';
import { fromBase64Url, toBase64Url } from './codec';

/** Same-origin in production (the app's own Worker serves /api/relay). */
export const RELAY_ORIGIN: string =
  (import.meta.env.VITE_RELAY_ORIGIN as string | undefined) ?? (import.meta.env.PROD ? '' : 'https://opensource.unisim.co.uk/palspayin');

export function relayUrl(path: string): string {
  return `${RELAY_ORIGIN}/api/relay${path}`;
}

export async function generateRelayKey(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const raw = await crypto.subtle.exportKey('raw', key);
  return toBase64Url(new Uint8Array(raw));
}

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = fromBase64Url(keyB64);
  if (raw.length !== 32) throw new Error('Relay key must be 256 bits');
  return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptEvent(event: LedgerEvent, keyB64: string): Promise<string> {
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(event));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext as BufferSource));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toBase64Url(out);
}

export async function decryptEvent(ciphertext: string, keyB64: string): Promise<LedgerEvent | null> {
  try {
    const key = await importKey(keyB64);
    const data = fromBase64Url(ciphertext);
    const iv = data.subarray(0, 12);
    const ct = data.subarray(12);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource);
    return JSON.parse(new TextDecoder().decode(plain)) as LedgerEvent;
  } catch {
    // Wrong key or corrupt row: union whatever we CAN decrypt, skip the rest.
    return null;
  }
}

export interface RelayStatus {
  ok: boolean;
  /** Human-readable failure the UI can show verbatim. */
  problem?: string;
  pushed: number;
  pulled: LedgerEvent[];
  cursor: number;
}

/**
 * One sync round: push events the relay lacks, pull events we lack.
 * `cursor` is the relay's row sequence we've already seen (0 = everything).
 */
export async function syncWithRelay(
  groupId: string,
  keyB64: string,
  localEvents: LedgerEvent[],
  cursor: number,
): Promise<RelayStatus> {
  try {
    // Pull first, so we know what the relay already holds.
    const pullRes = await fetch(relayUrl(`/${groupId}/events?after=${cursor}`), { method: 'GET' });
    if (pullRes.status === 429) return fail('The relay is rate-limiting this connection — try again in a minute.');
    if (!pullRes.ok) return fail(`The relay answered ${pullRes.status}.`);
    const pullBody = (await pullRes.json()) as { rows: { event_id: string; ciphertext: string; seq: number }[]; cursor: number };

    const remoteIds = new Set(pullBody.rows.map((r) => r.event_id));
    const pulled: LedgerEvent[] = [];
    for (const row of pullBody.rows) {
      const ev = await decryptEvent(row.ciphertext, keyB64);
      if (ev && ev.id === row.event_id) pulled.push(ev);
    }

    // First sync this session: fetch the relay's full id list (ids only,
    // cheap) so we don't re-encrypt and re-POST history it already holds.
    // Re-pushing would be harmless — the relay dedupes on (group, event_id) —
    // but it burns the rate budget for nothing.
    if (!remembered.has(groupId) && cursor > 0) {
      const idsRes = await fetch(relayUrl(`/${groupId}/ids`), { method: 'GET' });
      if (idsRes.ok) {
        const idsBody = (await idsRes.json()) as { ids: string[] };
        idsBody.ids.forEach((id) => rememberRemote(groupId, id));
      }
    }

    // Push what the relay hasn't seen. The relay dedupes on (group, event_id),
    // so re-pushing is idempotent — union semantics end to end.
    const localIds = new Set(localEvents.map((e) => e.id));
    const toPush = localEvents.filter((e) => !remoteIds.has(e.id) && !knownRemote(groupId, e.id));
    let pushed = 0;
    for (let i = 0; i < toPush.length; i += PUSH_BATCH) {
      const batch = toPush.slice(i, i + PUSH_BATCH);
      const events = await Promise.all(batch.map(async (e) => ({ id: e.id, ct: await encryptEvent(e, keyB64) })));
      const res = await fetch(relayUrl(`/${groupId}/events`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events }),
      });
      if (res.status === 413) return fail('This batch is over the relay size cap.');
      if (res.status === 429) return fail('The relay is rate-limiting this connection — try again in a minute.');
      if (res.status === 507) return fail('This group has hit the relay event cap. Compact the history, then sync again.');
      if (!res.ok) return fail(`The relay answered ${res.status}.`);
      pushed += batch.length;
      batch.forEach((e) => rememberRemote(groupId, e.id));
    }
    pullBody.rows.forEach((r) => rememberRemote(groupId, r.event_id));
    return { ok: true, pushed, pulled: pulled.filter((e) => !localIds.has(e.id)), cursor: pullBody.cursor };

    function fail(problem: string): RelayStatus {
      return { ok: false, problem, pushed: 0, pulled: [], cursor };
    }
  } catch {
    return { ok: false, problem: 'Could not reach the relay — are you offline?', pushed: 0, pulled: [], cursor };
  }
}

/** Delete the relay's copy of a group. The capability is the authority. */
export async function deleteRelayGroup(groupId: string): Promise<boolean> {
  try {
    const res = await fetch(relayUrl(`/${groupId}`), { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

const PUSH_BATCH = 100;

// Ids we know the relay already holds — avoids re-encrypting and re-POSTing
// the whole history every round. Purely an optimisation: losing this cache
// only costs idempotent re-pushes.
const remembered = new Map<string, Set<string>>();
function knownRemote(groupId: string, id: string): boolean {
  return remembered.get(groupId)?.has(id) ?? false;
}
function rememberRemote(groupId: string, id: string) {
  let s = remembered.get(groupId);
  if (!s) remembered.set(groupId, (s = new Set()));
  s.add(id);
}

// --------------------------------------------------------------------------- capability links

export function capabilityFragment(groupId: string, keyB64: string): string {
  return `g=${groupId}.${keyB64}`;
}

export function parseCapabilityFragment(fragment: string): { groupId: string; key: string } | null {
  const m = /(?:^|&)g=([0-9a-f]{32})\.([A-Za-z0-9_-]{43})(?:&|$)/.exec(fragment);
  return m ? { groupId: m[1], key: m[2] } : null;
}
