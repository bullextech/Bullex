import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool, storage } from "../storage";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { documents } from "../../shared/schema";
import { documentBrowseColumns } from "../document-read-projections";

const ids: string[] = [];
after(async () => {
  for (const id of ids) await storage.deleteDocument(id);
  await pool.end();
});

test("client lists preserve visibility, browse shape and newest-first ordering", async () => {
  const client = randomUUID();
  const other = randomUUID();
  const sentIds: string[] = [];
  const generatedIds: string[] = [];
  const statuses = ["draft", "pending_review", "approved", "sent", "accepted", "rejected"];
  // Include sent-only, generated-only, overlapping ownership, other-client and
  // unowned rows. Generated visibility must not acquire a status restriction.
  for (const [recipient, submitter] of [
    [client, other], [other, client], [client, client],
    [other, other], [null, null],
  ]) {
    for (const status of statuses) {
      const doc = await storage.createDocument({
        docType: "SPA", title: "Client list regression", content: `Terms ${status}`,
      });
      ids.push(doc.id);
      await pool.query(
        `UPDATE documents SET sent_to_client_id = $2, submitted_by_client_id = $3,
          status = $4, created_at = $5, admin_checks = $6::jsonb WHERE id = $1`,
        [doc.id, recipient, submitter, status,
          new Date(Date.UTC(2026, 0, 1, 0, ids.length)),
          JSON.stringify([{ key: "ordinary", checked: true },
            { key: "lpgStsReview", clearance: null, history: [{ type: "amendment", note: "Private history" }] }])],
      );
      if (recipient === client && status === "sent") sentIds.unshift(doc.id);
      if (submitter === client) generatedIds.unshift(doc.id);
    }
  }

  const browse = await storage.getDocumentsForBrowse();
  const sent = await storage.getSentDocumentsForClient(client);
  const generated = await storage.getGeneratedDocumentsForClient(client);
  assert.deepEqual(sent, browse.filter(d => d.sentToClientId === client && d.status === "sent"));
  assert.deepEqual(generated, browse.filter(d => d.submittedByClientId === client));
  assert.deepEqual(sent.map(d => d.id), sentIds);
  assert.deepEqual(generated.map(d => d.id), generatedIds);
  for (const doc of [...sent, ...generated]) {
    assert.ok(doc.content);
    assert.deepEqual(doc.adminChecks, [
      { key: "ordinary", checked: true }, { key: "lpgStsReview", clearance: null },
    ]);
  }
});

test("client lists return empty arrays for a client with no matching documents", async () => {
  const client = randomUUID();
  assert.deepEqual(await storage.getSentDocumentsForClient(client), []);
  assert.deepEqual(await storage.getGeneratedDocumentsForClient(client), []);
});

test("client indexes support ordered lookups on a 100,000-document archive", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // No real archive rows are inserted or changed. Copy the live index DDL so
    // this test fails if schema/setup has not actually installed the indexes.
    const { rows: indexes } = await client.query(`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'documents'
        AND indexname IN ('documents_sent_client_status_created_idx',
                          'documents_submitted_client_created_idx')`);
    assert.equal(indexes.length, 2, "apply the client indexes before running this test");
    await client.query("CREATE TEMP TABLE documents (LIKE public.documents INCLUDING DEFAULTS) ON COMMIT DROP");
    await client.query(`
      INSERT INTO pg_temp.documents
        (id, doc_type, title, content, status, sent_to_client_id, submitted_by_client_id, created_at)
      SELECT 'archive-' || n, 'SPA', 'Synthetic archive', repeat('Terms ', 100),
        CASE WHEN n % 3 = 0 THEN 'sent' WHEN n % 3 = 1 THEN 'draft' ELSE 'rejected' END,
        CASE WHEN n % 5 != 0 THEN 'client-' || (n % 1000) END,
        CASE WHEN n % 7 != 0 THEN 'client-' || (n % 1000) END,
        timestamp '2026-01-01' - n * interval '1 minute'
      FROM generate_series(1, 100000) n`);
    await client.query("ANALYZE pg_temp.documents");
    const db = drizzle(client);
    const queries = [
      db.select(documentBrowseColumns).from(documents)
        .where(and(eq(documents.sentToClientId, "client-42"), eq(documents.status, "sent")))
        .orderBy(desc(documents.createdAt)).toSQL(),
      db.select(documentBrowseColumns).from(documents)
        .where(eq(documents.submittedByClientId, "client-42"))
        .orderBy(desc(documents.createdAt)).toSQL(),
    ];
    const explain = async (query: typeof queries[number]) => {
      const result = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`, query.params);
      return result.rows[0]["QUERY PLAN"][0];
    };
    const before = [];
    const expected = [];
    for (const query of queries) {
      before.push(await explain(query));
      expected.push((await client.query(query.sql, query.params)).rows);
    }
    for (const index of indexes) {
      assert.ok(index.indexdef.includes(" ON public.documents "));
      await client.query(index.indexdef.replace(" ON public.documents ", " ON pg_temp.documents "));
    }
    // Test both the normal unnamed statements used by storage and generic
    // parameterized plans, without forcing scans or disabling sorts.
    for (const mode of ["auto", "force_generic_plan"]) {
      await client.query(`SET LOCAL plan_cache_mode = '${mode}'`);
      for (const [i, query] of queries.entries()) {
        const plan = mode === "auto"
          ? await explain(query)
          : await (async () => {
            await client.query(`PREPARE client_archive_${i} AS ${query.sql}`);
            const args = i === 0 ? "'client-42', 'sent'" : "'client-42'";
            const result = await client.query(
              `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) EXECUTE client_archive_${i}(${args})`);
            await client.query(`DEALLOCATE client_archive_${i}`);
            return result.rows[0]["QUERY PLAN"][0];
          })();
        assert.equal(plan.Plan["Node Type"], "Index Scan");
        assert.equal(plan.Plan["Index Name"], i === 0
          ? "documents_sent_client_status_created_idx" : "documents_submitted_client_created_idx");
        assert.deepEqual((await client.query(query.sql, query.params)).rows, expected[i]);
        assert.ok(expected[i].length > 0);
        console.log(JSON.stringify({
          lookup: i === 0 ? "sent" : "generated", mode,
          before: before[i], after: plan,
        }));
      }
    }
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
