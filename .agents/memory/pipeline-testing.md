---
name: Server integration testing approach
description: How to write/run automated tests for server pipeline logic in this repo (no test framework installed)
---

# Server integration testing

There is no test framework (no vitest/jest) and `package.json` is off-limits to
edit. Write tests with Node's built-in runner (`import { test } from "node:test"`,
`node:assert/strict`) and run them with `npx tsx --test <file>`. Tests live in
`server/__tests__/*.test.ts`.

**Prefer service-layer over HTTP.** The session cookie is `secure: true`, so
authenticated requests do NOT persist over plain-HTTP test clients (same root
cause as the curl note). Test the exported pipeline functions directly instead.
For the deal pipeline these are `createDealFromEnquiries`, `approveTfrForDeal`,
`runDealCascade` (exported from `server/routes.ts`); the route handlers are thin
wrappers returning `{ok,status,message|value}`, so coverage is equivalent.

**Tests hit the real dev DB.** `storage` and `pool` are exported from
`server/storage.ts`. Track every created record and delete it in an `after()`
hook (docs, trades, blocks, deals, enquiries) so the append-only blockchain is
restored. Delete the minted block by its `block_number` (it's the new max, so
removing it re-links cleanly).

**Why:** keeps regressions on the cross-cutting (documents+blockchain+trades)
pipeline catchable without standing up auth or a separate test DB.

**Concurrency edge:** when two TFR approvals race, the loser is rejected with
EITHER 409 (lost the atomic `claimDealForTfrApproval`) OR 400 (winner finished
first, pre-check sees `tradeRef` set). Both prevent a duplicate trade — assert on
the "+1 trade / +1 block" count as the authoritative invariant, not the status.
