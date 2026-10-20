import test, { after } from "node:test";
import assert from "node:assert/strict";
import { storage } from "../storage";

// The signature-driven auto-chain (FCO→Deal Recap→SPA→TFR) relies on
// storage.createDocumentIfNoChild being idempotent per (parent, docType),
// even under concurrent sign requests from buyer and seller.

const createdIds: string[] = [];

async function makeParent() {
  const doc = await storage.createDocument({
    docType: "SPA",
    title: "SPA - idempotency test parent",
    status: "draft",
    content: "test parent",
  } as any);
  createdIds.push(doc.id);
  return doc;
}

after(async () => {
  for (const id of createdIds.reverse()) {
    try { await storage.deleteDocument(id); } catch {}
  }
});

test("createDocumentIfNoChild creates the first child and refuses a duplicate", async () => {
  const parent = await makeParent();
  const child1 = await storage.createDocumentIfNoChild(
    { docType: "TFR", title: "TFR - test child", status: "draft", content: "c1", parentDocId: parent.id } as any,
    parent.id,
    "TFR",
  );
  assert.ok(child1, "first create should succeed");
  createdIds.push(child1!.id);

  const child2 = await storage.createDocumentIfNoChild(
    { docType: "TFR", title: "TFR - test dup", status: "draft", content: "c2", parentDocId: parent.id } as any,
    parent.id,
    "TFR",
  );
  assert.equal(child2, null, "second create must be refused");
});

test("concurrent createDocumentIfNoChild calls yield exactly one child", async () => {
  const parent = await makeParent();
  const attempts = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      storage.createDocumentIfNoChild(
        { docType: "TFR", title: `TFR - race ${i}`, status: "draft", content: `r${i}`, parentDocId: parent.id } as any,
        parent.id,
        "TFR",
      ),
    ),
  );
  const created = attempts.filter((d) => d !== null);
  assert.equal(created.length, 1, "exactly one concurrent create must win");
  createdIds.push(created[0]!.id);
});

test("a different docType child is still allowed for the same parent", async () => {
  const parent = await makeParent();
  const tfr = await storage.createDocumentIfNoChild(
    { docType: "TFR", title: "TFR - t", status: "draft", content: "t", parentDocId: parent.id } as any,
    parent.id,
    "TFR",
  );
  assert.ok(tfr);
  createdIds.push(tfr!.id);
  const spa = await storage.createDocumentIfNoChild(
    { docType: "SPA", title: "SPA - s", status: "draft", content: "s", parentDocId: parent.id } as any,
    parent.id,
    "SPA",
  );
  assert.ok(spa, "different docType must not be blocked");
  createdIds.push(spa!.id);
});
