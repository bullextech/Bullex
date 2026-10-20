// Manual recovery path after an auto-chain child-creation failure.
//
// When signing a SPA, the auto-chain fans out to DLC_MT700 / PBG_MT760.
// (The TFR is not part of the chain: it is only prepared via the Deal
// Pipeline after deal matching.)
// If a child creation FAILS, admins are alerted to "create it manually from
// the parent document". These tests drive createNextDocumentForParent — the
// exact service function POST /api/documents/:id/create-next executes after
// its ownership check — and prove:
//   1. a failed atomic create (transaction rolled back) leaves NO phantom
//      child row that would block the manual retry,
//   2. the manual retry via the real route logic succeeds exactly once, and
//   3. a duplicate manual attempt is refused with a 409, never a second draft.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { storage } from "../storage";
import { createNextDocumentForParent } from "../routes";

const SPA_CHILD_TYPES = ["DLC_MT700", "PBG_MT760"] as const;

const SPA_CONTENT = `SALES AND PURCHASE AGREEMENT

SELLER:
Company Name: Bullfrog Group Ltd
Address: 1 Fenchurch St, London, UK

BUYER:
Company Name: Almexo Trading FZE
Address: Jebel Ali Free Zone, Dubai, UAE

Commodity: Iron Ore Fines 62%
Origin: Brazil
Quantity: 50,000 MT
Contract Price: USD 105.50 per MT
Payment Terms: Irrevocable DLC at sight
Port of Loading: Port of Tubarao
Port of Discharge: Qingdao Port
`;

const createdIds: string[] = [];

after(async () => {
  for (const id of createdIds.reverse()) {
    try { await storage.deleteDocument(id); } catch {}
  }
});

async function makeSignedSpaParent(label: string) {
  const doc = await storage.createDocument({
    docType: "SPA",
    title: `SPA - manual recovery test (${label})`,
    status: "draft",
    content: SPA_CONTENT,
    dealRecapNumber: `TST/TST-9999-${label}`,
    buyerSignature: "Buyer Signatory",
  } as any);
  createdIds.push(doc.id);
  return doc;
}

async function childrenOfType(parentId: string, docType: string) {
  const all = await storage.getDocuments();
  return all.filter((d) => d.parentDocId === parentId && d.docType === docType);
}

// Simulate the auto-chain failing mid-create: the atomic insert inside
// createDocumentIfNoChild throws (here via a NOT NULL violation on docType,
// standing in for any DB-level failure during the transaction).
async function simulateFailedChildCreate(parentId: string, childType: string) {
  await assert.rejects(
    storage.createDocumentIfNoChild(
      { docType: null, title: `${childType} - doomed`, status: "draft", content: "x", parentDocId: parentId } as any,
      parentId,
      childType,
    ),
    "the simulated child creation must fail",
  );
}

for (const childType of SPA_CHILD_TYPES) {
  test(`after a failed auto-create, ${childType} is created manually via create-next exactly once`, async () => {
    const parent = await makeSignedSpaParent(childType);

    // 1. Simulated auto-chain failure — the transaction must roll back fully.
    await simulateFailedChildCreate(parent.id, childType);
    assert.equal(
      (await childrenOfType(parent.id, childType)).length,
      0,
      "a failed create must not leave a phantom child row",
    );

    // 2. Manual recovery through the create-next route logic (gate + derive).
    const recovered = await createNextDocumentForParent(parent, childType, true);
    assert.equal(recovered.ok, true, `manual ${childType} creation after the failure must succeed`);
    if (!recovered.ok) return;
    createdIds.push(recovered.doc.id);
    assert.equal(recovered.doc.parentDocId, parent.id);
    assert.equal(recovered.doc.docType, childType);

    const children = await childrenOfType(parent.id, childType);
    assert.equal(children.length, 1, "exactly one child must exist after recovery");

    // 3. A second manual attempt must be refused with 409 — no duplicate draft.
    const dup = await createNextDocumentForParent(parent, childType, true);
    assert.equal(dup.ok, false, "a duplicate manual attempt must be refused");
    if (dup.ok) return;
    assert.equal(dup.status, 409);
    assert.equal((await childrenOfType(parent.id, childType)).length, 1, "still exactly one child");
  });
}

test("create-next: unsigned SPA admits bank drafts but refuses a TFR", async () => {
  const unsigned = await storage.createDocument({
    docType: "SPA",
    title: "SPA - unsigned manual recovery gate",
    status: "draft",
    content: SPA_CONTENT,
  } as any);
  createdIds.push(unsigned.id);
  // Bank drafts (DLC/PBG) may be prepared from an unsigned SPA so they can be
  // amended before sending by email.
  const dlc = await createNextDocumentForParent(unsigned, "DLC_MT700", true);
  assert.equal(dlc.ok, true, "an unsigned SPA must admit a DLC bank draft");
  if (dlc.ok) createdIds.push(dlc.doc.id);
  // The TFR is never a document-chain child — deal matching only.
  const tfr = await createNextDocumentForParent(unsigned, "TFR", true);
  assert.equal(tfr.ok, false, "an SPA must be blocked for TFR (deal matching only)");
  if (!tfr.ok) assert.equal(tfr.status, 400);
  // (Signed-SPA admission is proven by the recovery tests above.)
});

test("a failed create followed by concurrent manual create-next calls yields exactly one child", async () => {
  const parent = await makeSignedSpaParent("RACE");
  await simulateFailedChildCreate(parent.id, "DLC_MT700");

  const [a, b] = await Promise.all([
    createNextDocumentForParent(parent, "DLC_MT700", true),
    createNextDocumentForParent(parent, "DLC_MT700", true),
  ]);
  const winners = [a, b].filter((r) => r.ok) as Array<{ ok: true; doc: any }>;
  const losers = [a, b].filter((r) => !r.ok) as Array<{ ok: false; status: number }>;
  assert.equal(winners.length, 1, "exactly one concurrent manual retry must win");
  assert.equal(losers.length, 1);
  assert.equal(losers[0].status, 409, "the losing retry must get a 409");
  createdIds.push(winners[0].doc.id);
  assert.equal((await childrenOfType(parent.id, "DLC_MT700")).length, 1);
});
