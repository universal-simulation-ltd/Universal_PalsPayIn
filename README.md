# Universal PalsPayIn

**Split bills with friends. No account, no ads — and it never moves money.**

A shared-expense ledger that runs in your browser: log who paid for what,
split it evenly, exactly, by shares or item by item, and settle "who owes
whom" in the fewest transfers. Your ledger lives on your device; share it as
a link, a file, or through an end-to-end encrypted relay that stores bytes it
cannot read.

Live at **[opensource.unisim.co.uk/palspayin](https://opensource.unisim.co.uk/palspayin/)**.

## What it does

- **Groups of named people.** No accounts, no emails, no invitations — a name
  in a group is all a person is.
- **Four split modes**: evenly, exact amounts, shares/percentages, and
  itemised bills with per-item assignees plus prorated tax, tip, service
  charge and discounts. Every split sums to *exactly* the bill — the shares
  always add up, to the penny, and a split that doesn't sum is refused rather
  than silently "fixed".
- **Per-currency balances.** Alex can owe Sam €40 *and* £15, and the app says
  so rather than inventing an exchange rate. Where a rate matters (a euro
  bill on a sterling card), you type what the bank actually did.
- **Settle up in the fewest transfers** — genuinely. The app computes the
  provable minimum for real group sizes and says when it did: *"3 transfers —
  the fewest possible"*, falling back honestly above the measured limit. By
  default it prefers a plan where nobody pays someone they never owed, even
  when that costs one extra transfer.
- **Share as a link** — the whole ledger travels in the part of the URL after
  `#`, which never reaches any server. A live size meter tells you when the
  link outgrows a QR code or a messaging app, and a **file export** has no
  ceiling at all.
- **Merging can't lose anything.** Copies merge by set union: opening an old
  link is a no-op, never a rollback, and edits/removals from two phones
  reconcile with the conflict shown, never silently. If two people typed in
  the same taxi, the app asks — it never guesses.
- **Optional encrypted sync.** Turn it on and devices stay in step through a
  relay that holds only ciphertext. The key travels inside the join link and
  never reaches the server. Lose every copy of the link and the synced copy
  is unrecoverable — that's the deal, stated in the app.
- **PWA, offline, IndexedDB.** The ledger is arithmetic in your browser; only
  the optional sync needs a network.

## What it deliberately cannot do

**It never moves money.** It records that money was owed and that somebody
*says* money was sent. It does not know, and never implies it knows, whether
a transfer actually happened — "Alex marked £15 as sent" is a claim, not a
green tick. There is no wallet, no card entry, no bank connection, no
"request money", and no debt reminders (chasing a friend for £12 is a social
act, not an app feature). Pay each other in cash or through your own banking
app, then record it here.

Also refused, on purpose: receipt-scanning OCR (a scanner that misreads
£8.50 as £3.50 is worse than typing), bank imports, chat, budgeting
dashboards, groups larger than 30, and any feature gated behind sign-in.

## Develop

```
cd D:/Github/UNISIM/Universal_Apps/Universal_PalsPayIn     # (or your clone)
npm install
npm run dev -- --port 5201 --strictPort
```

Or just run `scripts/preview.ps1` (Windows) / `scripts/preview.sh` (macOS).

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm test` | Vitest — the ledger core is heavily property-tested |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run deploy` | Build + `wrangler deploy` (Worker: static assets + relay API) |

## Architecture

| File | Job |
|---|---|
| `src/lib/events.ts` | The append-only event log. Six immutable event kinds; merge is set union (a G-Set), so copies converge with no clocks and no server arbitration. |
| `src/lib/allocate.ts` | The one allocator every split reduces to. Largest-remainder, sums exactly, rotates the odd penny. |
| `src/lib/split.ts` | Split modes → shares, including itemised bills with prorated adjustments. |
| `src/lib/balances.ts` | Per-currency nets (`Σ = 0`, asserted) and the raw pairwise debts. |
| `src/lib/settle.ts` | Settle-up: exact minimum-transfer search below a measured crossover, greedy above it, labelled differently. |
| `src/lib/codec.ts` | Binary ledger codec → deflate → base64url share links, plus JSON file import/export. |
| `src/lib/compact.ts` | Folding old history into opening balances — the only way the log shrinks. |
| `src/lib/relay.ts` | AES-GCM client crypto + sync protocol for the encrypted relay. |
| `worker/relay.js` | The Cloudflare Worker: static assets + the relay API (D1, ciphertext-only, rate-limited, capped, 12-month TTL). |

## Privacy

The ledger lives in your browser (IndexedDB). Share links carry the ledger in
the URL fragment, which browsers do not send to servers. The optional relay
stores only ciphertext under a random group id; the AES-256 key rides in the
join link's fragment and never reaches us. Deleting the synced copy is one
request away in the app, and relay data idle for 12 months is deleted
automatically. Every device keeps a complete local copy regardless.

## Licence

MIT — see [LICENSE](LICENSE).
