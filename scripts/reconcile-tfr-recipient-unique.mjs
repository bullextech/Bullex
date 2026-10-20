import pg from "pg";

// Development-only, narrowly scoped repair for historical Drizzle name drift.
// Never remove rows, replace indexes, or answer schema-push prompts.
if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1") {
  throw new Error("TFR uniqueness reconciliation is development-only; use Publish for production.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for development reconciliation.");
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '15s'");
  // Serialize inspection and repair, including concurrent writes/setup runs.
  const repair = `
    DO $repair$
    DECLARE
      expected constant text := 'tfr_recipients_name_unique';
      equivalent record;
      duplicate_groups bigint;
    BEGIN
      IF to_regclass('public.tfr_recipients') IS NULL THEN
        RETURN; -- A fresh database is handled by the normal schema push.
      END IF;
      LOCK TABLE public.tfr_recipients IN ACCESS EXCLUSIVE MODE;
      SELECT count(*) INTO duplicate_groups FROM (
        SELECT name FROM public.tfr_recipients
        WHERE name IS NOT NULL GROUP BY name HAVING count(*) > 1
      ) duplicates;
      IF duplicate_groups > 0 THEN
        RAISE EXCEPTION 'TFR uniqueness blocked: % duplicate name groups; no data changed. Resolve manually without deleting rows.', duplicate_groups;
      END IF;

      -- Require the exact plain, valid, default btree uniqueness semantics.
      -- Partial/expression indexes and different keys are not interchangeable.
      SELECT c.conname, ci.relname AS index_name INTO equivalent
      FROM pg_index i
      JOIN pg_class ci ON ci.oid = i.indexrelid
      JOIN pg_am am ON am.oid = ci.relam
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attname = 'name'
      JOIN pg_opclass op ON op.oid = i.indclass[0]
      LEFT JOIN pg_constraint c ON c.conindid = i.indexrelid AND c.conrelid = i.indrelid
      WHERE i.indrelid = 'public.tfr_recipients'::regclass
        AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
        AND NOT i.indisprimary AND NOT i.indnullsnotdistinct
        AND i.indnkeyatts = 1 AND i.indnatts = 1 AND i.indkey[0] = a.attnum
        AND i.indpred IS NULL AND i.indexprs IS NULL
        AND am.amname = 'btree' AND op.opcdefault
        AND i.indoption[0] = 0 AND i.indcollation[0] = a.attcollation
        AND (c.oid IS NULL OR (c.contype = 'u' AND NOT c.condeferrable))
      ORDER BY (c.conname = expected) DESC NULLS LAST, c.conname NULLS LAST, ci.relname
      LIMIT 1;

      IF equivalent.conname = expected THEN
        RETURN;
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.tfr_recipients'::regclass AND conname = expected
      ) THEN
        RAISE EXCEPTION 'TFR uniqueness blocked: expected constraint exists with non-equivalent definition.';
      END IF;
      IF to_regclass('public.' || expected) IS NOT NULL
         AND equivalent.index_name IS DISTINCT FROM expected THEN
        RAISE EXCEPTION 'TFR uniqueness blocked: expected index name is occupied by a non-equivalent object.';
      END IF;

      IF equivalent.conname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.tfr_recipients RENAME CONSTRAINT %I TO %I',
                       equivalent.conname, expected);
      ELSIF equivalent.index_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.tfr_recipients ADD CONSTRAINT %I UNIQUE USING INDEX %I',
                       expected, equivalent.index_name);
      ELSE
        -- No equivalent protection exists; duplicate check and lock make this safe.
        ALTER TABLE public.tfr_recipients
          ADD CONSTRAINT tfr_recipients_name_unique UNIQUE (name);
      END IF;
    END $repair$;
  `;
  // These two verified historical drifts are the complete repair allowlist.
  // Do not generalize this to unrelated constraints or arbitrary schema changes.
  for (const table of ["tfr_recipients", "checklist_templates"]) {
    await client.query(repair.replaceAll("tfr_recipients", table).replaceAll("TFR uniqueness", `${table} uniqueness`));
  }
  await client.query("COMMIT");
  console.log("Development recipient/template uniqueness reconciled; existing rows preserved.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`Development TFR uniqueness reconciliation failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
