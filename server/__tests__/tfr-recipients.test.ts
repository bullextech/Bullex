// Saved TFR recipient directory maintenance: admins can correct (update by id)
// and remove saved addressees, so the reuse dropdown doesn't accumulate
// outdated or misspelled entries forever. Runs against the real dev DB with
// run-unique names and full cleanup.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { storage, pool } from "../storage";

const runTag = `TESTRCP-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const createdIds: string[] = [];

after(async () => {
  for (const id of createdIds) {
    try { await storage.deleteTfrRecipient(id); } catch {}
  }
  await pool.end();
});

async function makeRecipient(suffix: string) {
  const r = await storage.upsertTfrRecipient({
    name: `${runTag}-${suffix}`,
    address: "1 Old Street",
    attn: "Mr. Old",
    notes: null,
  });
  createdIds.push(r.id);
  return r;
}

test("updateTfrRecipient corrects fields in place by id", async () => {
  const r = await makeRecipient("edit");
  const updated = await storage.updateTfrRecipient(r.id, {
    name: `${runTag}-edit-renamed`,
    address: "2 New Avenue",
    attn: "Ms. New",
  });
  assert.ok(updated);
  assert.equal(updated!.id, r.id);
  assert.equal(updated!.name, `${runTag}-edit-renamed`);
  assert.equal(updated!.address, "2 New Avenue");
  assert.equal(updated!.attn, "Ms. New");
});

test("updateTfrRecipient with no fields returns the unchanged row", async () => {
  const r = await makeRecipient("noop");
  const same = await storage.updateTfrRecipient(r.id, {});
  assert.ok(same);
  assert.equal(same!.name, r.name);
  assert.equal(same!.address, r.address);
});

test("updateTfrRecipient returns undefined for a missing id", async () => {
  const missing = await storage.updateTfrRecipient(
    "00000000-0000-0000-0000-000000000000",
    { name: `${runTag}-ghost` },
  );
  assert.equal(missing, undefined);
});

test("renaming onto an existing recipient raises a unique violation", async () => {
  const a = await makeRecipient("dupe-a");
  const b = await makeRecipient("dupe-b");
  await assert.rejects(
    () => storage.updateTfrRecipient(b.id, { name: a.name }),
    (err: any) => err?.code === "23505" || err?.cause?.code === "23505",
  );
});

test("deleteTfrRecipient removes the row and reports missing ids", async () => {
  const r = await makeRecipient("delete");
  const deleted = await storage.deleteTfrRecipient(r.id);
  assert.ok(deleted);
  assert.equal(deleted!.id, r.id);
  const all = await storage.getTfrRecipients();
  assert.ok(!all.some((x) => x.id === r.id));
  const again = await storage.deleteTfrRecipient(r.id);
  assert.equal(again, undefined);
});
