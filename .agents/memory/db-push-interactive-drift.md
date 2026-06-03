---
name: db:push interactive prompts & session-table drop
description: Why post-merge db:push silently leaves dev-schema drift, and how to reconcile it safely without dropping the session table.
---

# drizzle-kit push interactive prompts cause silent dev-schema drift

`npm run db:push` (drizzle-kit) is **interactive** and cannot be driven by piped
stdin (`printf '\n' | npm run db:push` does NOT select menu options — the TUI
needs real key events). The post-merge setup script runs `db:push`, hits these
prompts, and the change never lands — so the **dev database silently drifts**
from `shared/schema.ts` after task merges.

## The three recurring prompts (and the correct answer)

1. **"Is <table> created or renamed from another table?"** — for a genuinely new
   table, the answer is *create*. Safe to instead `CREATE TABLE` it directly via
   SQL matching the schema column defs.
2. **"add <table>_<col>_unique unique constraint … truncate?"** — answer is
   **No, add without truncating**. Root cause: Postgres auto-names unique
   constraints `<table>_<col>_key`, but Drizzle expects `<table>_<col>_unique`.
   The constraint already exists under the `_key` name. Fix by renaming, not
   adding: `ALTER TABLE t RENAME CONSTRAINT t_col_key TO t_col_unique;`
   (check for duplicate values first; there usually are none).
3. **"You're about to delete session table … DATA LOSS"** — **always answer
   No, abort.** The `session` table is the express-session store created by
   connect-pg-simple, intentionally NOT in `shared/schema.ts`. Drizzle will
   forever propose dropping it. Never drop it.

## How to reconcile safely (no interactive push)

Do it additively via `executeSql` against the dev DB: create genuinely-new
tables, rename leftover `%_key` unique constraints to `_unique`. Find leftovers
with `SELECT conrelid::regclass, conname FROM pg_constraint WHERE contype='u'
AND conname LIKE '%\_key'`. Re-run `db:push` only to *surface* the next diff;
expect it to end at the "drop session" prompt — that's the clean steady state
(abort it).

**Why it matters:** A publish/schema-diff against a drifted dev DB behaves
unexpectedly. The publish "check for database diff" compares dev-vs-prod
(introspection, not `shared/schema.ts`), so a correct dev DB is a prerequisite.

## Not the same as the "endpoint has been disabled" publish error
That publish error is a managed-Postgres **compute endpoint** being suspended at
the infra/control-plane level ("Enable it using the API and retry") — usually
the *production* endpoint. Re-enabling dev via `createDatabase()` + a live query
does not toggle the prod endpoint; if it persists on publish it needs Replit
support. Schema-drift reconciliation is separate from this.
