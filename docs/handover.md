# Universal PalsPayIn — session handover

Written 2026-08-10, the session that built the app (scoped earlier in the
suite docs as "next products" §18; Phase 1 + Phase 2 shipped together, and
the owner kept the PalsPayIn name over the rename recommendation).

## 0. Phase 3 (added later the same day)

Pay-them deep links (member `handles` in the ledger — codec **v2**, v1 links
still decode via a pinned fixture test; only PayPal.me carries an amount,
Monzo/Revolut are handle-only + clipboard, bank details are an honest copy;
the post-link prompt records a claim, never a verification), monthly
**nudge templates** (per-device, outside the event log on purpose — see
`src/lib/recurring.ts`'s header for why; double-adds are caught by the
duplicate-suspicion prompt), and **receipt photos** (IndexedDB store
`photos`, downscaled ≤1600px, structurally unable to reach links/files/CSV/
relay). The fourth Phase 3 item — Universal ID group-listing — was refused:
capability links stored server-side would co-locate the AES keys with the
relay ciphertext. 70 unit tests; deployed via the repo's CI.

## 1. What was proved live vs only compiled

**Proved live (2026-08-10):**
- 60 unit tests green: allocator property tests (5,000 random cases sum
  exactly), the Verhoeff six-balance counterexample (exact search finds 4
  transfers where greedy gives 5), union-merge idempotence/commutativity,
  void-beats-amend, independent double-compaction converging, codec
  roundtrips through real deflate + base64url, compact/prune balance
  preservation.
- The relay API end to end against the deployed Worker + real D1: POST
  batch, GET events/ids, DELETE group, 404 on malformed group ids, and the
  `/palspayin/assets/*` rewrite serving 200.
- Production build + PWA generation; typecheck and lint clean.

**Compiled and reviewed, but NOT exercised by an automated test:**
- The React UI end to end (forms → store → IndexedDB → views). Eyeball via
  `scripts/preview.ps1` (port 5201).
- Two-device relay sync with real encryption (the crypto helpers are unit
  code; the sync loop against the live relay was only exercised implicitly).
- The duplicate-suspicion review UI.

## 2. Decisions that live in the code

- **EXACT_LIMIT = 18, measured not guessed** (`settle.bench.test.ts`). The
  textbook O(3^m) worst case is wrong for this memo — it only recurses on
  zero-sum masks, so the adversarial input is MAXIMUM zero-sum structure
  (±1 pairs): m=16 → 7 ms, m=18 → 44 ms, m=20 → ~400 ms.
- **Settle-up defaults to the constrained plan** (no new debtor-creditor
  pairs) when it costs ≤ 1 extra transfer; the UI offers the shorter plan
  behind a toggle and labels both honestly.
- **Event timestamps are second-precision** (`eventTimestamp()`): the codec
  stores seconds, and ms-vs-s asymmetry between a device that authored an
  event and one that decoded it from a link would make amend tie-breaks
  diverge.
- **Compacts subsume ENTRY ids only** (never members, never amends
  directly); pruning drops the subsumed entries plus their amend/void
  chains. Two devices compacting independently: deterministic order applies
  one and skips the other (`skippedCompacts`), so openings never
  double-count — tested.
- **The relay is D1 on the app's own Worker**, not a platform Supabase
  table. Same-origin API (no CORS in prod), no secrets held anywhere, caps
  and TTL enforced in `worker/relay.js`. The per-IP rate limit is
  best-effort (per-isolate memory, and requests via the portal proxy may
  share egress IPs) — the hard caps (batch 200/512 KB, 16 KB per event,
  20k rows per group, 12-month TTL) are what actually bound the bill.

## 3. Landmines specific to this repo

- ⚠️ **No catch-all `/palspayin/* → /index.html` rule in `_redirects`.**
  Workers static assets REJECTS it at deploy time as an infinite loop (the
  asset layer strips `.html` itself — the marketing site's /netzero trap in
  new clothes). `not_found_handling: single-page-application` provides the
  SPA fallback instead.
- ⚠️ First POST/DELETE against a freshly created D1 binding returned
  Cloudflare error 1042 for a minute or two after the first deploy, then
  healed. If it reappears, wait before debugging.
- The share-link format has a version byte; decoding a NEWER version refuses
  loudly. Any codec change must bump `FORMAT_VERSION` and keep the old
  decoder.
- `Docs_UNI_SIM` holds the §18.4 money-handling refusal test (also in the
  local CLAUDE.md, which is gitignored — public repo). Do not add payment
  features without reading it.

## 4. What is left

- Owner eyeball of the UI (preview table was provided at session end).
- Phase 1.5 ("sync now, we're both here" over Beam's WebRTC leg) was
  deliberately NOT built: the always-on encrypted relay covers the
  at-the-table case, so the extra transport buys little. Revisit only if
  users without sync ask for it.
- Phase 3 candidates (deep links to payment apps, recurring expenses,
  locally-attached receipt photos) are unstarted by design.
- The UNISIM_Compare entry: the suite docs say to hold it until the
  encrypted relay exists — it now does, so the entry is unblocked, but every
  competitor claim must be re-verified against live vendor pages before it
  ships. Not done this session.
