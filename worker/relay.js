/**
 * Universal PalsPayIn — the encrypted append-only relay, plus static assets.
 *
 * The server's whole job is to hold bytes it cannot read. A group is a
 * capability: knowing the 128-bit group id grants append and read of
 * CIPHERTEXT only — the AES-GCM key travels in the link's hash fragment and
 * never reaches this Worker. There are no accounts, no Universal ID, no orgs.
 *
 * One flat table: (group_id, event_id, ciphertext, created_at). Merge logic
 * lives entirely in clients (set union); the server does no reasoning.
 *
 * An unauthenticated append-only table is an abuse surface and an unmetered
 * bill, so the ceilings are hard and stated:
 *   - per-event ciphertext cap        (EVENT_CT_MAX)
 *   - per-batch count + body caps     (BATCH_MAX / BODY_MAX)
 *   - per-group event cap             (GROUP_EVENT_MAX) → 507, client says
 *     "compact the history"
 *   - per-IP rate limit               (RATE_MAX per RATE_WINDOW_MS) → 429.
 *     In-memory per isolate, so it is best-effort, not a guarantee — the hard
 *     caps above are what actually bound the bill.
 *   - TTL: groups idle for 12 months are deleted by the nightly cron. Every
 *     device holds a complete local copy, so expiry costs availability of the
 *     relay copy only.
 *
 * DELETE /api/relay/:group removes the relay's copy — the capability is the
 * authority, and this is the deletion path the privacy page points at.
 */

const GROUP_ID = /^[0-9a-f]{32}$/;
const EVENT_ID = /^[0-9a-f]{12}$/;
const EVENT_CT_MAX = 16 * 1024; // one encrypted event, base64url chars
const BATCH_MAX = 200; // events per POST
const BODY_MAX = 512 * 1024; // bytes per POST
const GROUP_EVENT_MAX = 20_000; // rows per group
const RATE_MAX = 120; // requests per window per IP
const RATE_WINDOW_MS = 60_000;
const TTL_DAYS = 365;

const rate = new Map(); // ip -> { n, windowStart } — per-isolate, best-effort

function rateLimited(ip) {
  const now = Date.now();
  const entry = rate.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rate.set(ip, { n: 1, windowStart: now });
    return false;
  }
  entry.n += 1;
  if (rate.size > 10_000) rate.clear(); // bound the map itself
  return entry.n > RATE_MAX;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Reached either directly (workers.dev, wrangler dev) or through the
    // portal Worker's /palspayin proxy — accept both path shapes.
    const path = url.pathname.replace(/^\/palspayin(?=\/)/, '');

    if (!path.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    if (rateLimited(ip)) return json({ error: 'rate limited' }, 429);

    const m = /^\/api\/relay\/([0-9a-f]{32})(\/events|\/ids)?$/.exec(path);
    if (!m || !GROUP_ID.test(m[1])) return json({ error: 'not found' }, 404);
    const groupId = m[1];
    const tail = m[2] ?? '';

    try {
      if (request.method === 'GET' && tail === '/events') {
        const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
        const { results } = await env.DB.prepare(
          'SELECT event_id, ciphertext, seq FROM relay_events WHERE group_id = ?1 AND seq > ?2 ORDER BY seq LIMIT 1000',
        )
          .bind(groupId, after)
          .all();
        const cursor = results.length ? results[results.length - 1].seq : after;
        return json({ rows: results, cursor });
      }

      if (request.method === 'GET' && tail === '/ids') {
        const { results } = await env.DB.prepare('SELECT event_id FROM relay_events WHERE group_id = ?1').bind(groupId).all();
        return json({ ids: results.map((r) => r.event_id) });
      }

      if (request.method === 'POST' && tail === '/events') {
        const raw = await request.arrayBuffer();
        if (raw.byteLength > BODY_MAX) return json({ error: 'body too large' }, 413);
        let body;
        try {
          body = JSON.parse(new TextDecoder().decode(raw));
        } catch {
          return json({ error: 'bad json' }, 400);
        }
        const events = Array.isArray(body?.events) ? body.events : null;
        if (!events || events.length === 0) return json({ error: 'no events' }, 400);
        if (events.length > BATCH_MAX) return json({ error: 'too many events in one batch' }, 413);
        for (const e of events) {
          if (!e || !EVENT_ID.test(e.id ?? '') || typeof e.ct !== 'string' || e.ct.length === 0 || e.ct.length > EVENT_CT_MAX || !/^[A-Za-z0-9_-]+$/.test(e.ct)) {
            return json({ error: 'malformed event' }, 400);
          }
        }

        const countRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM relay_events WHERE group_id = ?1').bind(groupId).first();
        if ((countRow?.n ?? 0) + events.length > GROUP_EVENT_MAX) {
          return json({ error: 'group event cap reached' }, 507);
        }

        const now = Date.now();
        const stmts = events.map((e) =>
          env.DB.prepare('INSERT OR IGNORE INTO relay_events (group_id, event_id, ciphertext, created_at) VALUES (?1, ?2, ?3, ?4)').bind(
            groupId,
            e.id,
            e.ct,
            now,
          ),
        );
        stmts.push(
          env.DB.prepare(
            'INSERT INTO relay_groups (group_id, last_write) VALUES (?1, ?2) ON CONFLICT(group_id) DO UPDATE SET last_write = ?2',
          ).bind(groupId, now),
        );
        await env.DB.batch(stmts);
        return json({ ok: true, accepted: events.length });
      }

      if (request.method === 'DELETE' && tail === '') {
        await env.DB.batch([
          env.DB.prepare('DELETE FROM relay_events WHERE group_id = ?1').bind(groupId),
          env.DB.prepare('DELETE FROM relay_groups WHERE group_id = ?1').bind(groupId),
        ]);
        return json({ ok: true });
      }

      return json({ error: 'not found' }, 404);
    } catch (err) {
      console.error('relay error', err);
      return json({ error: 'internal' }, 500);
    }
  },

  // Nightly TTL sweep: relay copies idle for 12 months are dropped. Local
  // ledgers are unaffected — the relay is transport, not the record.
  async scheduled(_event, env) {
    const cutoff = Date.now() - TTL_DAYS * 86_400_000;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM relay_events WHERE group_id IN (SELECT group_id FROM relay_groups WHERE last_write < ?1)').bind(cutoff),
      env.DB.prepare('DELETE FROM relay_groups WHERE last_write < ?1').bind(cutoff),
    ]);
  },
};
